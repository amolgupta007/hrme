import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { RegisterPushBodySchema } from "@/lib/mobile/notifications-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: register (or refresh) the caller's Expo push token. Upserted on
 * `expo_push_token` (unique) — a re-registration (relaunch, token refresh, or
 * switching active org) just re-stamps org/employee/clerk_user_id and bumps
 * `last_seen_at` rather than creating a duplicate row.
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
  const parsed = RegisterPushBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid_body" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabase();
  const { error } = await supabase.from("push_tokens").upsert(
    {
      org_id: user.orgId,
      employee_id: user.employeeId,
      clerk_user_id: userId,
      expo_push_token: parsed.data.expoPushToken,
      platform: parsed.data.platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "expo_push_token" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
