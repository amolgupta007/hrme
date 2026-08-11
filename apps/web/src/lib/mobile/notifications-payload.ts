import { z } from "zod";
import type { MobileNotification, MobileNotificationsResponse } from "@jambahr/shared";

/** GET /api/mobile/notifications page size. */
export const PAGE_SIZE = 30;

// ── Body schemas (mirror the leave/decide idiom: Zod in lib/mobile/*) ────────

/** POST /api/mobile/push/register. */
export const RegisterPushBodySchema = z.object({
  expoPushToken: z.string().trim().min(1, "expoPushToken is required"),
  platform: z.enum(["ios", "android"]),
});
export type RegisterPushBody = z.infer<typeof RegisterPushBodySchema>;

/** POST /api/mobile/push/unregister. */
export const UnregisterPushBodySchema = z.object({
  expoPushToken: z.string().trim().min(1, "expoPushToken is required"),
});
export type UnregisterPushBody = z.infer<typeof UnregisterPushBodySchema>;

/** POST /api/mobile/notifications/read — at least one of `ids`/`all`. */
export const MarkNotificationsReadBodySchema = z
  .object({
    ids: z.array(z.string().uuid()).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (!!v.ids && v.ids.length > 0), {
    message: "Provide ids or all",
  });
export type MarkNotificationsReadBody = z.infer<typeof MarkNotificationsReadBodySchema>;

// ── GET /api/mobile/notifications payload builder (pure, unit-testable) ──────

/** A `notifications` row as selected by the route (snake_case DB shape). */
export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function toDTO(row: NotificationRow): MobileNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/**
 * Shapes the GET /api/mobile/notifications payload. `rows` are already
 * queried newest-first, capped at `PAGE_SIZE` by the route. `nextCursor` is
 * the last row's `created_at` when a FULL page came back — a short page
 * means there is nothing further to fetch, so it's `null`.
 */
export function buildNotificationsPayload(
  rows: NotificationRow[],
  unreadCount: number,
): MobileNotificationsResponse {
  const notifications = rows.map(toDTO);
  const nextCursor =
    rows.length === PAGE_SIZE ? (rows[rows.length - 1]?.created_at ?? null) : null;
  return { notifications, unreadCount, nextCursor };
}
