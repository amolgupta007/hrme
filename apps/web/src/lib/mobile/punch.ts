import { z } from "zod";

/**
 * Mobile punch request body. `clientEventId` is a client-minted UUID for
 * offline-replay idempotency (unique index `uq_punch_events_client_event`).
 * `punchedAt` must be a full ISO-8601 timestamp with an offset (Z or +hh:mm).
 * `lat`/`lng` are optional coarse GPS (mobile punches bypass zone filtering).
 */
export const PunchBodySchema = z.object({
  clientEventId: z.string().uuid(),
  punchedAt: z.string().datetime({ offset: true }),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

export type PunchBody = z.infer<typeof PunchBodySchema>;

/** Clock-skew tolerance: a punch may be at most ±24h from server-now. */
export const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

export function isWithinClockSkew(punchedAtIso: string, nowMs: number): boolean {
  const t = new Date(punchedAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return Math.abs(t - nowMs) <= CLOCK_SKEW_MS;
}
