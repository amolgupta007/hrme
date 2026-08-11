import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { UnregisterPushBodySchema } from "@/lib/mobile/notifications-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: unregister the caller's Expo push token (sign-out). Deletion is
 * self-scoped by org+employee (not just the token value) so a caller can only
 * ever delete their own `push_tokens` row.
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
  const parsed = UnregisterPushBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("push_tokens")
    .delete()
    .eq("expo_push_token", parsed.data.expoPushToken)
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
