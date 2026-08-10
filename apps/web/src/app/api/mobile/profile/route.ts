import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildProfile,
  buildProfileUpdatePatch,
  MobileProfileUpdateSchema,
  type ProfileEmployeeRow,
} from "@/lib/mobile/profile-payload";

export const dynamic = "force-dynamic";

const PROFILE_SELECT =
  "id, first_name, last_name, designation, email, personal_email, phone, gender, pronouns, marital_status, country, date_of_birth, communication_address, permanent_address, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, whatsapp_opt_in, avatar_url, pan_number, aadhar_number, departments!department_id(name)";

async function loadProfileRow(
  supabase: ReturnType<typeof createAdminSupabase>,
  orgId: string,
  employeeId: string,
) {
  const { data } = await supabase
    .from("employees")
    .select(PROFILE_SELECT)
    .eq("org_id", orgId)
    .eq("id", employeeId)
    .maybeSingle();
  return data as ProfileEmployeeRow | null;
}

/** GET /api/mobile/profile — view-broad payload; PAN/Aadhaar masked, no salary. */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }
  if (!user.employeeId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const supabase = createAdminSupabase();
  const row = await loadProfileRow(supabase, user.orgId, user.employeeId);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(buildProfile(row));
}

/**
 * POST /api/mobile/profile — edit-narrow. Only phone, personal email, emergency
 * contact, and WhatsApp opt-in are writable; the Zod schema is `.strict()` so
 * PAN/Aadhaar/names/dob are rejected and can never reach the DB update.
 */
export async function POST(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }
  if (!user.employeeId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const parsed = MobileProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "invalid_body" }, { status: 400 });
  }

  const supabase = createAdminSupabase();
  const patch = buildProfileUpdatePatch(parsed.data);

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("employees")
      .update(patch as any)
      .eq("org_id", user.orgId)
      .eq("id", user.employeeId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const row = await loadProfileRow(supabase, user.orgId, user.employeeId);
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(buildProfile(row));
}
