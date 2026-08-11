import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { approveLeave, rejectLeave } from "@/actions/leaves";
import { approvePunch, rejectPunch } from "@/actions/attendance-punches";
import { approveOvertime, rejectOvertime } from "@/actions/overtime";
import { approveDisbursement } from "@/actions/disbursement";
import type { ActionResult } from "@/types";

export const dynamic = "force-dynamic";

const DecideApprovalBodySchema = z.object({
  type: z.enum(["leave", "regularization", "ot", "payroll"]),
  id: z.string().min(1),
  action: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).optional(),
});

/**
 * Mobile BFF: unified Approvals inbox action endpoint (Mobile D4 Owner/Admin,
 * Task 4). Routes an approve/reject to the correct existing web server
 * action for the given `type`, passing `X-Org-Id` through as `orgIdHint` so
 * the action targets the same org the mobile caller is scoped to.
 *
 * Each downstream action enforces its own role/scope guard (manager-scope
 * for leave/regularization, admin-only for OT/payroll) — this route only
 * blocks employees outright and additionally requires admin for the
 * payroll type specifically. Payroll has no mobile reject path (RazorpayX
 * disbursement rejection isn't modeled) — reject always 400s for it.
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
  const parsed = DecideApprovalBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }
  const { type, id, action, comment } = parsed.data;

  if (type === "payroll" && !isAdmin(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (type === "payroll" && action === "reject") {
    return NextResponse.json({ error: "Reject payroll on web" }, { status: 400 });
  }
  if (type !== "payroll" && action === "reject" && !comment) {
    return NextResponse.json({ error: "comment_required" }, { status: 400 });
  }

  const orgIdHint = request.headers.get("x-org-id");

  let result: ActionResult<unknown>;
  switch (type) {
    case "leave":
      result =
        action === "approve"
          ? await approveLeave(id, comment, orgIdHint)
          : await rejectLeave(id, comment, orgIdHint);
      break;
    case "regularization":
      result =
        action === "approve"
          ? await approvePunch(id, orgIdHint)
          : await rejectPunch(id, comment as string, orgIdHint);
      break;
    case "ot":
      result =
        action === "approve"
          ? await approveOvertime(id, orgIdHint)
          : await rejectOvertime(id, comment as string, orgIdHint);
      break;
    case "payroll":
      result = await approveDisbursement(id, orgIdHint);
      break;
  }

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, data: result.data });
}
