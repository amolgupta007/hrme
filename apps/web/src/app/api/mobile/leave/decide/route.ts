import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getManagerScopedEmployeeIds } from "@/lib/attendance/manager-scope";
import { approveLeave, rejectLeave } from "@/actions/leaves";
import { DecideLeaveBodySchema } from "@/lib/mobile/leave-payload";
import type { MobileLeaveOkResponse } from "@jambahr/shared";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: approve/reject a leave request (manager+).
 *
 * CRITICAL scope guard: `approveLeave`/`rejectLeave` only check
 * `isManagerOrAbove` — NOT that the request belongs to the caller's team. That
 * is a latent web gap (any manager could approve any org request). This route
 * closes it: it loads the request org-scoped and verifies its `employee_id` is
 * in the caller's scope (`getManagerScopedEmployeeIds` for managers; admins
 * any) BEFORE delegating to the action. Out-of-scope → 403 `forbidden`.
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
  if (!isManagerOrAbove(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = DecideLeaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }
  const { requestId, decision, comment } = parsed.data;

  const supabase = createAdminSupabase();

  // Load the target request scoped to the caller's (header-resolved) org.
  const { data: reqRow } = await supabase
    .from("leave_requests")
    .select("id, employee_id, status")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!reqRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Scope guard (the fix): a non-admin may only decide requests of employees in
  // their manager scope.
  if (!isAdmin(user.role)) {
    const me = user.employeeId;
    if (!me) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const scope = await getManagerScopedEmployeeIds(user.orgId, me);
    if (!scope.includes((reqRow as { employee_id: string }).employee_id)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // Pass the header org so the action targets the SAME org the scope guard just
  // validated against — not the action's cookie/first-membership fallback (which
  // for a multi-org caller would silently update 0 rows and return false success).
  const orgIdHint = request.headers.get("x-org-id");
  const result =
    decision === "approve"
      ? await approveLeave(requestId, comment, orgIdHint)
      : await rejectLeave(requestId, comment, orgIdHint);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const payload: MobileLeaveOkResponse = { ok: true };
  return NextResponse.json(payload);
}
