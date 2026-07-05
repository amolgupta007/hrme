import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

type PunchBody = {
  employee_code: string;
  timestamp?: string;
  event_type?: "auto" | "clock_in" | "clock_out";
  device_id?: string;
};

export async function POST(req: Request) {
  // --- Auth: Bearer token ---
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabase();

  // Look up org by device_token in settings JSONB
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, settings")
    .eq("settings->>device_token" as any, token);

  const org = orgs?.[0] as { id: string; settings: any } | undefined;

  if (!org) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!org.settings?.fingerprint_enabled) {
    return NextResponse.json(
      { error: "Fingerprint integration not enabled" },
      { status: 403 }
    );
  }

  // --- Parse body ---
  const body: PunchBody = await req.json().catch(() => ({}));
  const { employee_code, timestamp, event_type = "auto", device_id } = body;

  if (!employee_code) {
    return NextResponse.json(
      { error: "employee_code is required" },
      { status: 400 }
    );
  }

  // --- Validate timestamp (reject if > 24h in past or future) ---
  const punchTime = timestamp ? new Date(timestamp) : new Date();

  if (isNaN(punchTime.getTime())) {
    return NextResponse.json(
      { error: "Invalid timestamp format" },
      { status: 422 }
    );
  }

  const diffMs = Math.abs(Date.now() - punchTime.getTime());
  if (diffMs > 24 * 60 * 60 * 1000) {
    return NextResponse.json(
      { error: "Timestamp is more than 24 hours from server time" },
      { status: 422 }
    );
  }

  const today = punchTime.toISOString().slice(0, 10);
  const punchIso = punchTime.toISOString();

  // --- Resolve employee: device_code first, fallback to email ---
  let employee: { id: string; first_name: string; last_name: string } | null = null;

  const { data: byCode } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("org_id", org.id)
    .eq("device_code", employee_code)
    .eq("status", "active")
    .single();

  if (byCode) {
    employee = byCode as any;
  } else {
    const { data: byEmail } = await supabase
      .from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", org.id)
      .eq("email", employee_code)
      .eq("status", "active")
      .single();

    if (byEmail) {
      employee = byEmail as any;
    }
  }

  if (!employee) {
    return NextResponse.json(
      { error: `Employee not found for code: ${employee_code}` },
      { status: 404 }
    );
  }

  // --- Check today's existing record ---
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, clock_in_at, clock_out_at")
    .eq("org_id", org.id)
    .eq("employee_id", employee.id)
    .eq("date", today)
    .single();

  const isClockedIn =
    existing &&
    (existing as any).clock_in_at &&
    !(existing as any).clock_out_at;

  // --- Determine action ---
  let action: "clock_in" | "clock_out";
  if (event_type === "clock_in") {
    if (isClockedIn) {
      return NextResponse.json({ error: "Already clocked in" }, { status: 409 });
    }
    action = "clock_in";
  } else if (event_type === "clock_out") {
    if (!isClockedIn) {
      return NextResponse.json({ error: "Not clocked in" }, { status: 409 });
    }
    action = "clock_out";
  } else {
    // auto
    action = isClockedIn ? "clock_out" : "clock_in";
  }

  // --- Write to DB ---
  if (action === "clock_in") {
    const { error } = await supabase.from("attendance_records").insert({
      org_id: org.id,
      employee_id: employee.id,
      date: today,
      clock_in_at: punchIso,
      source: "device",
      device_id: device_id ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const clockInTime = new Date((existing as any).clock_in_at).getTime();
    const totalMinutes = Math.round((punchTime.getTime() - clockInTime) / 60_000);
    const { error } = await supabase
      .from("attendance_records")
      .update({
        clock_out_at: punchIso,
        total_minutes: totalMinutes,
        source: "device",
        device_id: device_id ?? null,
      })
      .eq("id", (existing as any).id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    action,
    employee_name: `${employee.first_name} ${employee.last_name}`,
    time: punchIso,
  });
}
