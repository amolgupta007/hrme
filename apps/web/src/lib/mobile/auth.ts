import { NextResponse } from "next/server";
import { getCurrentUser, type UserContext } from "@/lib/current-user";

/**
 * Mobile BFF auth gate: resolve the caller's active-org context, or hand back
 * the exact error response the route should return.
 *
 * Exists to keep one distinction honest across all 26 `/api/mobile/*` routes:
 *
 *   403 no_membership      → lookup RAN and found no org for this account
 *   503 service_unavailable → lookup FAILED (database unreachable)
 *
 * Before this, both collapsed into 403 `no_membership`, which the app renders
 * as "no workspace" — so a database outage told users their org was gone
 * (2026-09-26). Throwing would have been honest but lands as an opaque 500
 * whose empty body the client maps to "You're offline", which is also false.
 *
 * NOTE: the MembershipLookupError check is by `name`, deliberately NOT by
 * importing `isMembershipLookupError`. 16 route tests mock `@/lib/current-user`
 * with a factory that exports only getCurrentUser/isAdmin/isManagerOrAbove;
 * importing another binding from it would break every one of them. The name
 * check needs nothing from the mocked module.
 */
export type MobileAuthResult =
  | { ok: true; user: UserContext }
  | { ok: false; response: NextResponse };

export async function resolveMobileUser(
  request: Request
): Promise<MobileAuthResult> {
  let user: UserContext | null;

  try {
    user = await getCurrentUser({
      orgIdHint: request.headers.get("x-org-id"),
    });
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { name?: unknown }).name === "MembershipLookupError"
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "service_unavailable" },
          { status: 503 }
        ),
      };
    }
    throw err;
  }

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "no_membership" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}
