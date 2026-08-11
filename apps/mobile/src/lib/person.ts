import type { MobilePersonProfile } from "@jambahr/shared";
import { useMobileQuery } from "@/lib/query";

/** Query key for one employee's admin/manager mini-profile. */
export function personQueryKey(orgId: string | null | undefined, id: string | null | undefined) {
  return ["mobile", "person", orgId, id] as const;
}

/**
 * GET the admin/manager People quick-lookup mini-profile for one employee
 * (`/api/mobile/directory/[id]`). View-only — no salary/PAN/Aadhaar/bank/CTC.
 * Disabled when `id` (or `orgId`) is missing, e.g. before a row is tapped.
 */
export function usePerson(orgId: string | null | undefined, id: string | null | undefined) {
  return useMobileQuery<MobilePersonProfile>(
    personQueryKey(orgId, id),
    `/api/mobile/directory/${id}`,
    { orgId, enabled: !!orgId && !!id, staleTime: 30_000 }
  );
}
