import type { MobileHomeResponse } from "@jambahr/shared/mobile/types";

/**
 * The single source of truth for the Home query key. Both the Home screen
 * (`useMobileQuery`) and the punch mutation/drain (`use-punch.ts`) must key on
 * exactly this so optimistic writes + server-truth writes land on the same
 * cache entry. Includes `orgId` because the BFF is org-scoped (multi-org
 * users) — see the `useMobileQuery` contract note.
 */
export function homeQueryKey(orgId: string | null | undefined) {
  return ["mobile", "home", orgId] as const;
}

/**
 * Optimistic today-status after a punch. Clocked out → clock in (open the
 * shift at `punchedAt`); clocked in → clock out (close at `punchedAt`). The
 * server's returned `today` overwrites this on success; a rollback restores
 * the snapshot on a 4xx rejection.
 */
export function optimisticToday(
  prev: MobileHomeResponse["today"],
  punchedAt: string
): MobileHomeResponse["today"] {
  if (prev.isClockedIn) {
    return { ...prev, isClockedIn: false, clockOutAt: punchedAt };
  }
  return {
    ...prev,
    isClockedIn: true,
    clockInAt: punchedAt,
    clockOutAt: null,
  };
}
