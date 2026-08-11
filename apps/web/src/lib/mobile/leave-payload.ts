import { z } from "zod";
import type { MobileLeaveResponse, MobileLeaveRequestItem } from "@jambahr/shared";
import { buildLeaveBalances, type LeavePolicyUsage } from "./home-payload";

// ── Body schemas (mirror the D1 punch/regularize idiom: Zod in lib/mobile/*) ──

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** POST /api/mobile/leave/apply — self-only apply. `days` is NEVER trusted from
 * the client; the route derives it via the shared `computeLeaveDays`. */
export const ApplyLeaveBodySchema = z.object({
  policyId: z.string().uuid(),
  startDate: z.string().regex(DATE_RE, "Invalid start date"),
  endDate: z.string().regex(DATE_RE, "Invalid end date"),
  startHalfDay: z.boolean().optional().default(false),
  endHalfDay: z.boolean().optional().default(false),
  reason: z.string().max(2000).optional(),
});
export type ApplyLeaveBody = z.infer<typeof ApplyLeaveBodySchema>;

/** POST /api/mobile/leave/cancel. */
export const CancelLeaveBodySchema = z.object({ requestId: z.string().uuid() });

/** POST /api/mobile/leave/decide (manager+). */
export const DecideLeaveBodySchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  comment: z.string().max(2000).optional(),
});

// ── GET /api/mobile/leave payload builder (pure, unit-testable) ───────────────

/** A leave_requests row already flattened by the route (policy name/type +
 * approver name resolved from the reviewed_by join). */
export type RawLeaveRequestRow = {
  id: string;
  start_date: string;
  end_date: string;
  days: number | string;
  status: string;
  reason: string | null;
  start_half_day: boolean | null;
  end_half_day: boolean | null;
  reviewed_at: string | null;
  policyName: string;
  type: string;
  approverName: string | null;
};

/**
 * Shapes the staff Leaves-tab payload. Balances reuse `buildLeaveBalances`
 * (the home-payload aggregation) so the two screens can never drift. Requests
 * are mapped in the order given — the route supplies them reverse-chron (≤50).
 */
export function buildLeavePayload(input: {
  policies: LeavePolicyUsage[];
  requests: RawLeaveRequestRow[];
}): MobileLeaveResponse {
  const myRequests: MobileLeaveRequestItem[] = input.requests.map((r) => ({
    id: r.id,
    policyName: r.policyName,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    days: Number(r.days),
    startHalfDay: !!r.start_half_day,
    endHalfDay: !!r.end_half_day,
    status: r.status,
    reason: r.reason ?? null,
    approverName: r.approverName ?? null,
    decidedAt: r.reviewed_at ?? null,
  }));
  return { balances: buildLeaveBalances(input.policies), myRequests };
}
