import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MobileProfile } from "@jambahr/shared";
import { ApiError, useApi } from "@/lib/api";

/**
 * Profile query key + the edit mutation. The mutation is ONLINE-ONLY: the
 * QueryClient sets `networkMode: 'always'` for mutations (fail-fast when
 * offline instead of pausing), and profile edits have no offline queue — a
 * failed save surfaces inline and the user retries when connected.
 */

export function profileQueryKey(orgId: string | null | undefined) {
  return ["mobile", "profile", orgId] as const;
}

/**
 * The mobile-editable whitelist — mirrors `MobileProfileUpdateSchema` web-side
 * (`profile-payload.ts`). PAN/Aadhaar/names/dob are structurally absent: the
 * server strips unknown keys, but keeping the client body narrow makes the
 * contract obvious. Absent keys are left unchanged server-side.
 */
export type ProfileUpdateBody = {
  phone?: string;
  personalEmail?: string;
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  whatsappOptIn?: boolean;
};

const PROFILE_PATH = "/api/mobile/profile";

/**
 * Update the caller's profile. On success the server returns the full, freshly
 * re-read `MobileProfile`, which we write straight into the cache (no refetch
 * round-trip). Callers surface `profileErrorCopy(error)` on failure.
 */
export function useUpdateProfile(orgId: string | null | undefined) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const key = profileQueryKey(orgId);

  return useMutation<MobileProfile, unknown, ProfileUpdateBody>({
    mutationFn: (body) =>
      apiFetch<MobileProfile>(
        PROFILE_PATH,
        { method: "POST", body: JSON.stringify(body) },
        orgId
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData<MobileProfile>(key, updated);
    },
  });
}

/** Human copy for a profile save failure. Server validation strings pass through. */
export function profileErrorCopy(error: unknown): string {
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
    case "not_found":
      return "Your employee record isn't active. Contact your admin.";
    case "invalid_body":
      return "Please check the form and try again.";
    default:
      // Server-derived message (e.g. "Invalid email").
      return error.code;
  }
}
