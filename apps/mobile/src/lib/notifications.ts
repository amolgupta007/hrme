import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MobileNotificationsResponse } from "@jambahr/shared";
import { useApi } from "@/lib/api";
import { useMobileQuery } from "@/lib/query";
import { homeQueryKey } from "@/lib/home";

const NOTIFICATIONS_PATH = "/api/mobile/notifications";
const READ_PATH = "/api/mobile/notifications/read";

/** Query key for the caller's notification feed. */
export function notificationsQueryKey(orgId: string | null | undefined) {
  return ["mobile", "notifications", orgId] as const;
}

/**
 * GET the caller's notification feed (first page, newest first) + total
 * unread count. No pagination in v1 — `nextCursor` is in the DTO for a
 * future "load more", not consumed here.
 */
export function useNotifications(orgId: string | null | undefined) {
  return useMobileQuery<MobileNotificationsResponse>(
    notificationsQueryKey(orgId),
    NOTIFICATIONS_PATH,
    { orgId, enabled: !!orgId, staleTime: 30_000 }
  );
}

export type MarkReadBody = { ids?: string[]; all?: boolean };

/**
 * Mark notifications read. Invalidates the notifications feed (unread dots +
 * count) and the Home payload (the bell badge reads `unreadNotifications`
 * from there) on success.
 */
export function useMarkRead(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, unknown, MarkReadBody>({
    mutationFn: (body) =>
      apiFetch<{ ok: true }>(READ_PATH, { method: "POST", body: JSON.stringify(body) }, orgId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: homeQueryKey(orgId) });
    },
  });
}

/**
 * A route every screen in the app can actually push to (typed-routes checks
 * these literals against the generated route union — see
 * `apps/mobile/src/app/notifications.tsx`, `(tabs)/leaves.tsx`, `payslips.tsx`,
 * `(tabs)/home.tsx`).
 */
export type NotificationRoute = "/(tabs)/leaves" | "/payslips" | "/(tabs)/home";

/**
 * `notifications.type` → in-app destination. Single source of truth shared
 * by the notifications-list row tap (`notifications-screen.tsx`) and the
 * push-tap listener (`_layout.tsx`). Unknown/missing type → `null`, meaning
 * "no specific destination" — callers decide the fallback (list screen stays
 * put; the push listener falls back to the notifications list itself).
 *
 * `doc_ack` routes to Home rather than a dedicated documents screen — mobile
 * has no documents surface yet (More tab shows it as "Soon").
 */
export function routeForNotificationType(type: string | null | undefined): NotificationRoute | null {
  switch (type) {
    case "leave_decision":
      return "/(tabs)/leaves";
    case "payslip_paid":
      return "/payslips";
    case "doc_ack":
      return "/(tabs)/home";
    default:
      return null;
  }
}
