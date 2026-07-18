import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MobileRegularizeRequest,
  MobileRegularizeResponse,
} from "@jambahr/shared/mobile/types";
import { ApiError, useApi } from "@/lib/api";
import { attendanceMonthQueryKey } from "@/lib/attendance";
import { homeQueryKey } from "@/lib/home";

const REGULARIZE_PATH = "/api/mobile/attendance/regularize";

/** Human copy for the BFF error codes a regularization can return. */
export function regularizeErrorCopy(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "network_error";
  switch (code) {
    case "date_not_past":
      return "Corrections are only for past days — use the punch button for today.";
    case "before_employment":
      return "That date is before your joining date.";
    case "in_not_on_date":
    case "out_not_on_date":
      return "The times must fall on the selected day.";
    case "out_before_in":
      return "Punch-out must be after punch-in.";
    case "duplicate_time":
      return "A punch already exists at this exact time — adjust the time by a minute and resubmit.";
    case "attendance_disabled":
      return "Attendance isn't enabled for your organization.";
    case "inactive_employee":
    case "no_employee":
      return "Your employee record isn't active. Contact your admin.";
    case "network_error":
      return "You're offline. Try again once you're connected.";
    default:
      return "Couldn't submit your request. Please try again.";
  }
}

/**
 * Regularization submit mutation (Phase D Slice 1, Task 7). On success the
 * corrected day's month calendar AND the Home payload (pending-count card)
 * are invalidated so the "pending" chip and the Needs-attention count appear
 * on the next render without a manual refresh.
 */
export function useRegularize(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();

  return useMutation<MobileRegularizeResponse, unknown, MobileRegularizeRequest>({
    mutationFn: (vars) =>
      apiFetch<MobileRegularizeResponse>(
        REGULARIZE_PATH,
        { method: "POST", body: JSON.stringify(vars) },
        orgId
      ),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({
        queryKey: attendanceMonthQueryKey(orgId, vars.date.slice(0, 7)),
      });
      void queryClient.invalidateQueries({ queryKey: homeQueryKey(orgId) });
    },
  });
}
