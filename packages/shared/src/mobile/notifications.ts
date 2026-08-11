/**
 * Mobile BFF DTOs for push notifications (Mobile PRD D3 Stage D, Task 3). The
 * mobile app and the `/api/mobile/push/*` + `/api/mobile/notifications*`
 * route handlers both import from here — these types are the wire contract.
 *
 * Types only. No runtime logic (Zod validation lives web-side in
 * apps/web/src/lib/mobile/notifications-payload.ts). See
 * docs/superpowers/plans/2026-08-11-mobile-push-notifications.md.
 */

export interface MobileNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface MobileNotificationsResponse {
  notifications: MobileNotification[];
  unreadCount: number;
  /** Pass back as `?cursor=` to fetch the next page; `null` = no more pages. */
  nextCursor: string | null;
}
