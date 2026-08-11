import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, useApi } from "@/lib/api";
import { useMobileQuery } from "@/lib/query";

/**
 * Account-deletion REQUEST flow (Phase D Slice 3, Stage C). JambaHR is B2B —
 * this does NOT delete the employee/attendance/payroll data; it records a
 * request and notifies the org's admins, who offboard via the terminate flow.
 *
 * The mutation is ONLINE-ONLY (no offline queue): the QueryClient sets
 * `networkMode: 'always'` for mutations (fail-fast when offline), and a
 * one-shot deletion request has no meaningful replay-while-offline story.
 */

export type MobileDeletionRequest = { status: "pending"; requestedAt: string };
type DeletionRequestGet = { request: MobileDeletionRequest | null };

const DELETION_PATH = "/api/mobile/account/deletion-request";

export function deletionRequestQueryKey(orgId: string | null | undefined) {
  return ["mobile", "account-deletion", orgId] as const;
}

/**
 * GET the caller's current pending deletion request (or null). Drives the
 * More-tab row: pending → static "requested" state; null → actionable button.
 */
export function useDeletionRequest(orgId: string | null | undefined) {
  return useMobileQuery<DeletionRequestGet>(deletionRequestQueryKey(orgId), DELETION_PATH, {
    orgId,
    staleTime: 60_000,
  });
}

/** POST "Delete my account". On success the pending state is written to cache. */
export function useRequestDeletion(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const key = deletionRequestQueryKey(orgId);

  return useMutation<MobileDeletionRequest, unknown, { reason?: string }>({
    mutationFn: (body) =>
      apiFetch<MobileDeletionRequest>(
        DELETION_PATH,
        { method: "POST", body: JSON.stringify(body) },
        orgId,
      ),
    onSuccess: (request) => {
      queryClient.setQueryData<DeletionRequestGet>(key, { request });
    },
  });
}

/** Human copy for a deletion-request failure. */
export function deletionErrorCopy(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "You're offline. Try again once you're connected.";
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
    default:
      return "Couldn't send your request. Please try again.";
  }
}
