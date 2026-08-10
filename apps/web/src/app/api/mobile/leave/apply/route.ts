import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { computeLeaveDays } from "@jambahr/shared";
import { requestLeave } from "@/actions/leaves";
import { ApplyLeaveBodySchema } from "@/lib/mobile/leave-payload";
import type { MobileApplyLeaveResponse } from "@jambahr/shared";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: apply for leave — SELF ONLY (mobile v1). The client never sends
 * `days`; the server derives it via the shared `computeLeaveDays` (half-day
 * chips subtract 0.5 each) and hands it to `requestLeave`, which re-runs the
 * full PR #22 validation (overlap + balance + scope) and persists the two
 * half-day flags. Validation failures surface verbatim as 400 `{error}` so the
 * app can show the overlap/balance/half-day copy directly.
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
  const parsed = ApplyLeaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }
  const { policyId, startDate, endDate, startHalfDay, endHalfDay, reason } = parsed.data;

  // Server-derive days (never trust a client `days`). Half-day-zero / bad range
  // rejected here with the shared helper's message before touching the action.
  const derived = computeLeaveDays(startDate, endDate, startHalfDay, endHalfDay);
  if (!derived.ok) {
    return NextResponse.json({ error: derived.error }, { status: 400 });
  }

  const result = await requestLeave({
    employeeId: user.employeeId,
    policyId,
    startDate,
    endDate,
    days: derived.days,
    reason,
    exceedsBalance: false,
    startHalfDay,
    endHalfDay,
  });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const payload: MobileApplyLeaveResponse = { id: result.data.id };
  return NextResponse.json(payload);
}
