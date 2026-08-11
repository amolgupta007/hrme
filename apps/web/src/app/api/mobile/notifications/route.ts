import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCurrentUser } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  buildNotificationsPayload,
  PAGE_SIZE,
  type NotificationRow,
} from "@/lib/mobile/notifications-payload";

export const dynamic = "force-dynamic";

/**
 * Mobile BFF: the caller's in-app notification feed. Newest first, page size
 * 30. `?cursor=<ISO created_at>` pages backward (strictly older than the
 * cursor); `?unread=1` filters to unread only. `unreadCount` is always the
 * caller's TOTAL unread count (ignores cursor/unread filters) so the Home
 * bell badge stays correct regardless of what page/filter is being viewed.
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
  if (!user.employeeId) {
    return NextResponse.json(buildNotificationsPayload([], 0));
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const unreadOnly = url.searchParams.get("unread") === "1";

  const supabase = createAdminSupabase();

  let listQuery = supabase
    .from("notifications")
    .select("id, type, title, body, data, read_at, created_at")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) {
    listQuery = listQuery.lt("created_at", cursor);
  }
  if (unreadOnly) {
    listQuery = listQuery.is("read_at", null);
  }

  const [{ data: rows, error }, { count: unreadCount }] = await Promise.all([
    listQuery,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", user.orgId)
      .eq("employee_id", user.employeeId)
      .is("read_at", null),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    buildNotificationsPayload((rows as NotificationRow[] | null) ?? [], unreadCount ?? 0),
  );
}
