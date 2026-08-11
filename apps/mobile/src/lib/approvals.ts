import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MobileApprovalsResponse, MobileApprovalType } from "@jambahr/shared";
import { ApiError, useApi } from "@/lib/api";
import { useMobileQuery } from "@/lib/query";
import { homeQueryKey } from "@/lib/home";

const APPROVALS_PATH = "/api/mobile/approvals";
const DECIDE_PATH = "/api/mobile/approvals/decide";

/** Query key for the merged Owner/Admin Approvals inbox. */
export function approvalsQueryKey(orgId: string | null | undefined) {
  return ["mobile", "approvals", orgId] as const;
}

/**
 * GET the merged Approvals inbox (leave / regularization / OT / payroll),
 * newest-first, plus per-type + total counts. Manager+ only server-side —
 * the BFF 403s an employee caller.
 */
export function useApprovals(orgId: string | null | undefined) {
  return useMobileQuery<MobileApprovalsResponse>(
    approvalsQueryKey(orgId),
    APPROVALS_PATH,
    { orgId, enabled: !!orgId, staleTime: 30_000 }
  );
}

export type DecideApprovalBody = {
  type: MobileApprovalType;
  id: string;
  action: "approve" | "reject";
  comment?: string;
};

export type DecideApprovalResponse = { ok: true; data: unknown };

/**
 * Approve/reject one Approvals inbox item. On success, invalidates the
 * Approvals query (item disappears / counts drop) AND the Home query
 * (the "needs attention" badge reads its own pending count from there).
 */
export function useDecide(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();

  return useMutation<DecideApprovalResponse, unknown, DecideApprovalBody>({
    mutationFn: (body) =>
      apiFetch<DecideApprovalResponse>(
        DECIDE_PATH,
        { method: "POST", body: JSON.stringify(body) },
        orgId
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: approvalsQueryKey(orgId) });
      void queryClient.invalidateQueries({ queryKey: homeQueryKey(orgId) });
    },
  });
}

/**
 * Human copy for an Approvals decide failure (`/api/mobile/approvals/decide`).
 * Downstream action errors (overlap/scope/already-decided/etc.) are passed
 * through as the response body VERBATIM by the route, so any `ApiError.code`
 * that isn't one of the known transport codes is already an end-user
 * sentence — shown as-is. Mirrors `leaveErrorCopy` in `lib/leave.ts`.
 */
export function approvalErrorCopy(error: unknown): string {
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
      return "Your employee record isn't active. Contact your admin.";
    case "forbidden":
      return "You don't have permission to do that.";
    case "not_found":
      return "That request no longer exists.";
    case "invalid_body":
      return "Please check the request and try again.";
    case "comment_required":
      return "A comment is required to reject.";
    default:
      // Server-derived human message (already-decided / scope / etc.).
      return error.code;
  }
}
