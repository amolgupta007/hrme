import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  computeLeaveDays,
  type MobileApplyLeaveResponse,
  type MobileLeaveApprovalsResponse,
  type MobileLeaveOkResponse,
  type MobileLeaveRequestItem,
  type MobileLeaveResponse,
} from "@jambahr/shared";
import { ApiError, useApi } from "@/lib/api";
import { homeQueryKey } from "@/lib/home";

/**
 * Request body for `POST /api/mobile/leave/apply`. The BFF derives `days`
 * server-side from the date range + half-day flags (never trusts a client
 * `days`), so the client sends none — see the apply route + `computeLeaveDays`.
 *
 * NOTE (DTO gap): `@jambahr/shared/mobile/leave` exports only the RESPONSE
 * types; the request bodies live as Zod schemas web-side (`leave-payload.ts`).
 * These local mirrors are the wire contract until/unless request DTOs are
 * promoted to shared.
 */
export type ApplyLeaveBody = {
  policyId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startHalfDay: boolean;
  endHalfDay: boolean;
  reason?: string;
};

export type DecideLeaveBody = {
  requestId: string;
  decision: "approve" | "reject";
  comment?: string;
};

const APPLY_PATH = "/api/mobile/leave/apply";
const CANCEL_PATH = "/api/mobile/leave/cancel";
const DECIDE_PATH = "/api/mobile/leave/decide";

/** Query key for the staff Leaves payload (balances + own requests). */
export function leaveQueryKey(orgId: string | null | undefined) {
  return ["mobile", "leave", orgId] as const;
}

/** Query key for the manager Approvals payload (pending decisions). */
export function leaveApprovalsQueryKey(orgId: string | null | undefined) {
  return ["mobile", "leave", "approvals", orgId] as const;
}

/**
 * Human copy for a leave mutation failure. The apply/cancel/decide routes pass
 * the underlying action's validation string through VERBATIM as the error body
 * (overlap/balance/half-day-zero are already end-user sentences), so an
 * `ApiError.code` that reads like a sentence is shown as-is; only the transport
 * codes get a friendlier rewrite.
 */
export function leaveErrorCopy(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }
  switch (error.code) {
    case "network_error":
    case "unknown":
      return "You're offline. Try again once you're connected.";
    case "unauthenticated":
      return "Your session expired. Sign in again.";
    case "no_membership":
    case "no_employee":
      return "Your employee record isn't active. Contact your admin.";
    case "forbidden":
      return "You don't have permission to do that.";
    case "not_found":
      return "That request no longer exists.";
    case "invalid_body":
      return "Please check the form and try again.";
    default:
      // Server-derived human message (overlap / balance / half-day-zero / …).
      return error.code;
  }
}

/** India financial-year label for the given date, e.g. "FY 2026–27". */
export function financialYearLabel(now: Date = new Date()): string {
  // FY runs 1 Apr – 31 Mar. Before April, we're still in the prior FY.
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const end = String((startYear + 1) % 100).padStart(2, "0");
  return `FY ${startYear}–${end}`;
}

/**
 * Apply-for-leave mutation. Optimistically prepends a `pending` request to the
 * cached Leaves payload (policy name/type resolved from the cached balances) so
 * the row appears instantly, then invalidates both the leave and home payloads
 * on settle so the server truth (and the recomputed balances / pending count)
 * lands. A 4xx rejection rolls the optimistic insert back and the caller
 * surfaces `leaveErrorCopy(error)`.
 */
export function useApplyLeave(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const key = leaveQueryKey(orgId);

  return useMutation<
    MobileApplyLeaveResponse,
    unknown,
    ApplyLeaveBody,
    { prev?: MobileLeaveResponse }
  >({
    mutationFn: (body) =>
      apiFetch<MobileApplyLeaveResponse>(
        APPLY_PATH,
        { method: "POST", body: JSON.stringify(body) },
        orgId
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<MobileLeaveResponse>(key);
      const derived = computeLeaveDays(
        body.startDate,
        body.endDate,
        body.startHalfDay,
        body.endHalfDay
      );
      if (prev && derived.ok) {
        const policy = prev.balances.find((b) => b.policyId === body.policyId);
        const optimistic: MobileLeaveRequestItem = {
          id: `optimistic-${Date.now()}`,
          policyName: policy?.name ?? "Leave",
          type: policy?.type ?? "custom",
          startDate: body.startDate,
          endDate: body.endDate,
          days: derived.days,
          startHalfDay: body.startHalfDay,
          endHalfDay: body.endHalfDay,
          status: "pending",
          reason: body.reason ?? null,
          approverName: null,
          decidedAt: null,
        };
        queryClient.setQueryData<MobileLeaveResponse>(key, {
          ...prev,
          myRequests: [optimistic, ...prev.myRequests],
        });
      }
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: homeQueryKey(orgId) });
    },
  });
}

/**
 * Cancel-a-pending-request mutation. Optimistically removes the row (the server
 * enforces the pending-only + ownership guards) and invalidates leave + home
 * on settle.
 */
export function useCancelLeave(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const key = leaveQueryKey(orgId);

  return useMutation<
    MobileLeaveOkResponse,
    unknown,
    string,
    { prev?: MobileLeaveResponse }
  >({
    mutationFn: (requestId) =>
      apiFetch<MobileLeaveOkResponse>(
        CANCEL_PATH,
        { method: "POST", body: JSON.stringify({ requestId }) },
        orgId
      ),
    onMutate: async (requestId) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<MobileLeaveResponse>(key);
      if (prev) {
        queryClient.setQueryData<MobileLeaveResponse>(key, {
          ...prev,
          myRequests: prev.myRequests.filter((r) => r.id !== requestId),
        });
      }
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: homeQueryKey(orgId) });
    },
  });
}

/**
 * Approve/reject mutation (manager+). Optimistically drops the decided request
 * from the pending Approvals list, then invalidates approvals + leave + home on
 * settle (the requester's own list + everyone's pending counts move).
 */
export function useDecideLeave(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const key = leaveApprovalsQueryKey(orgId);

  return useMutation<
    MobileLeaveOkResponse,
    unknown,
    DecideLeaveBody,
    { prev?: MobileLeaveApprovalsResponse }
  >({
    mutationFn: (body) =>
      apiFetch<MobileLeaveOkResponse>(
        DECIDE_PATH,
        { method: "POST", body: JSON.stringify(body) },
        orgId
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<MobileLeaveApprovalsResponse>(key);
      if (prev) {
        queryClient.setQueryData<MobileLeaveApprovalsResponse>(key, {
          ...prev,
          requests: prev.requests.filter((r) => r.requestId !== body.requestId),
        });
      }
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: leaveQueryKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: homeQueryKey(orgId) });
    },
  });
}

/** Shared date helpers for the Leaves UI (plain calendar parse, no tz shift). */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08-14" → "14 Aug". */
export function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

/**
 * A leave date range → a compact human label. Same day → "14 Aug"; same month →
 * "14 – 16 Aug"; else "30 Aug – 2 Sep".
 */
export function dateRangeLabel(start: string, end: string): string {
  if (start === end) return shortDate(start);
  const [, sm] = start.split("-").map(Number);
  const [, em] = end.split("-").map(Number);
  if (sm === em) {
    const sd = Number(start.split("-")[2]);
    return `${sd} – ${shortDate(end)}`;
  }
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** ISO instant → "14 Aug 2026" (device-local). Used for approver attribution. */
export function decidedAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/** Number → "1 day" / "1.5 days" (trims trailing ".0"). */
export function daysLabel(days: number): string {
  const n = Number.isInteger(days) ? String(days) : days.toFixed(1);
  return `${n} ${days === 1 ? "day" : "days"}`;
}
