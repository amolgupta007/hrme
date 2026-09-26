import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { resolveMobileUser } from "@/lib/mobile/auth";
import { cancelLeave } from "@/actions/leaves";
import { CancelLeaveBodySchema } from "@/lib/mobile/leave-payload";
import type { MobileLeaveOkResponse } from "@jambahr/shared";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: cancel a leave request. Delegates to `cancelLeave`, whose guard
 * already enforces ownership (own request / admin / manager-of-record) AND the
 * pending-only rule (`.eq('status','pending')`). Its error string passes
 * through as 400 `{error}`.
 */
export async function POST(request: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const resolved = await resolveMobileUser(request);
  if (!resolved.ok) return resolved.response;
  const user = resolved.user;

  const body = await request.json().catch(() => null);
  const parsed = CancelLeaveBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }

  const result = await cancelLeave(parsed.data.requestId, request.headers.get("x-org-id"));
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const payload: MobileLeaveOkResponse = { ok: true };
  return NextResponse.json(payload);
}
