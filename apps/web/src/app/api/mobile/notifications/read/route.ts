import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { MarkNotificationsReadBodySchema } from "@/lib/mobile/notifications-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: mark the caller's own notifications read. `{all:true}` clears
 * every unread row; `{ids:[...]}` clears only those (still self-scoped —
 * an id belonging to another employee is silently excluded by the org+
 * employee filter, not a separate ownership check).
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
    return NextResponse.json({ error: "no_employee" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = MarkNotificationsReadBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();
  let query = supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .is("read_at", null);

  if (!parsed.data.all) {
    query = query.in("id", parsed.data.ids as string[]);
  }

  const { error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
