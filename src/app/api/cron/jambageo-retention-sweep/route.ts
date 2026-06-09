import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = createAdminSupabase();

  // Quick exit: count all pings first. Phase 1 has zero pings — early return
  // avoids the more expensive per-org sweep on an empty table.
  const { count } = await sb
    .from("location_pings")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) === 0) {
    return NextResponse.json({ ok: true, scanned: 0, deleted: 0 });
  }

  // For each org that has at least one duty_session (and therefore pings),
  // compute the per-employee retention cutoff and delete expired pings.
  //
  // Join path:  location_pings → duty_sessions (session_id)
  //             → geo_consents (employee_id, retention_days — per-employee override)
  //             → organizations.settings.jambageo.default_retention_days (fallback, default 90)
  //
  // Phase 1: this branch is dead code (no pings exist). Written defensively for Phase 2.

  const { data: orgs } = await sb
    .from("organizations")
    .select("id, settings");

  let totalDeleted = 0;

  for (const org of orgs ?? []) {
    const o = org as { id: string; settings: Record<string, any> | null };
    const defaultDays: number =
      (o.settings?.jambageo?.default_retention_days as number | undefined) ?? 90;

    // Fetch per-employee retention overrides (active consents only)
    const { data: consents } = await sb
      .from("geo_consents")
      .select("employee_id, retention_days")
      .eq("org_id", o.id)
      .is("revoked_at", null);

    const retentionByEmployee = new Map<string, number>(
      (consents ?? []).map((c: any) => [c.employee_id as string, c.retention_days as number])
    );

    // Fetch all duty sessions for this org
    const { data: sessions } = await sb
      .from("duty_sessions")
      .select("id, employee_id")
      .eq("org_id", o.id);

    if (!sessions || sessions.length === 0) continue;

    const now = Date.now();

    for (const session of sessions as Array<{ id: string; employee_id: string }>) {
      const days = retentionByEmployee.get(session.employee_id) ?? defaultDays;
      const cutoff = new Date(now - days * 86_400_000).toISOString();

      const { count: delCount } = await sb
        .from("location_pings")
        .delete({ count: "exact" })
        .eq("session_id", session.id)
        .lt("captured_at", cutoff);

      totalDeleted += delCount ?? 0;
    }
  }

  return NextResponse.json({ ok: true, scanned: count, deleted: totalDeleted });
}
