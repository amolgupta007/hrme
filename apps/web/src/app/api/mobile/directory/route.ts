import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { buildDirectory, type DirectoryEmployeeRow } from "@/lib/mobile/directory-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: the People/Directory tab. Employee-safe projection (no salary,
 * no PAN/Aadhaar), org-scoped, active members only, name order. Any authed org
 * member may read it.
 */
export async function GET(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await getCurrentUser({ orgIdHint: request.headers.get("x-org-id") });
  if (!user) {
    return NextResponse.json({ error: "no_membership" }, { status: 403 });
  }

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, phone, role, avatar_url, departments!department_id(name)")
    .eq("org_id", user.orgId)
    .neq("status", "terminated")
    .order("first_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: DirectoryEmployeeRow[] = ((data as any[]) ?? []).map((e) => ({
    id: e.id,
    first_name: e.first_name,
    last_name: e.last_name,
    email: e.email ?? null,
    phone: e.phone ?? null,
    role: e.role,
    avatar_url: e.avatar_url ?? null,
    departments: e.departments ?? null,
  }));

  return NextResponse.json(buildDirectory(rows));
}
