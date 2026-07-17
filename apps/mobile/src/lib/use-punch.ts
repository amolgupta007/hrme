import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MobileHomeResponse,
  MobilePunchRequest,
  MobilePunchResponse,
} from "@jambahr/shared/mobile/types";
import { ApiError, useApi } from "@/lib/api";
import { homeQueryKey, optimisticToday } from "@/lib/home";
import { createOfflineQueue, type QueuedPunch } from "@/lib/offline-queue";

const PUNCH_PATH = "/api/mobile/attendance/punch";

/** Consecutive failed drains before we surface the persistent "can't sync" banner. */
const DRAIN_FAILURE_BANNER_THRESHOLD = 3;

/**
 * A 4xx from the BFF is a *deterministic* rejection (bad body, clock skew,
 * attendance disabled, inactive employee) — replaying the same punch will
 * always fail, so it must be surfaced and dropped, NEVER queued/retried. A
 * network error or a 5xx is transient: the punch is queued (idempotent on
 * `clientEventId`) and replayed on reconnect/foreground.
 */
function is4xx(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/** Human copy for the BFF error codes a punch can return (4xx surface path). */
function punchErrorCopy(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "network_error";
  switch (code) {
    case "clock_skew":
      return "Your device clock looks off. Fix the time and try again.";
    case "attendance_disabled":
      return "Attendance isn't enabled for your organization.";
    case "inactive_employee":
    case "no_employee":
      return "Your employee record isn't active. Contact your admin.";
    case "no_membership":
      return "You're not a member of this organization.";
    default:
      return "Couldn't record your punch. Please try again.";
  }
}

type PunchVars = MobilePunchRequest;
type PunchContext = { previous: MobileHomeResponse | undefined };

/**
 * Punch mutation + offline queue drain for the Home screen.
 *
 * `namespace` is the Clerk user id (identity storage namespace) so the queue
 * is scoped per-account and is wiped by the DPDP sign-out/org-switch flow in
 * `query.tsx`. `orgId` scopes the BFF call + the Home cache key.
 *
 * Optimistic flow: `onMutate` cancels the Home query, snapshots it, and flips
 * `today` locally. On success the server's fresh `today` overwrites the cache.
 * On a 4xx it rolls back + surfaces `punchError`. On a network/5xx error it
 * enqueues `{clientEventId, punchedAt, …}` (frozen at tap time) and keeps the
 * optimistic state — the drain replays exactly those bytes.
 */
export function usePunch({
  namespace,
  orgId,
}: {
  namespace: string;
  orgId: string | null | undefined;
}) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const queue = useMemo(() => createOfflineQueue(namespace), [namespace]);

  const [queueCount, setQueueCount] = useState(() => queue.peekAll().length);
  const [drainFailures, setDrainFailures] = useState(0);
  const [punchError, setPunchError] = useState<string | null>(null);
  const draining = useRef(false);

  // Re-sync the badge to the NEW queue when the identity/org changes (queue is
  // memoized on `namespace`). React's sanctioned "adjust state during render on
  // a changed dependency" pattern — avoids a setState-in-effect and applies the
  // reset before paint.
  const [trackedQueue, setTrackedQueue] = useState(queue);
  if (trackedQueue !== queue) {
    setTrackedQueue(queue);
    setQueueCount(queue.peekAll().length);
    setDrainFailures(0);
  }

  const key = homeQueryKey(orgId);

  const mutation = useMutation<MobilePunchResponse, unknown, PunchVars, PunchContext>({
    mutationFn: (vars) =>
      apiFetch<MobilePunchResponse>(
        PUNCH_PATH,
        { method: "POST", body: JSON.stringify(vars) },
        orgId
      ),
    onMutate: async (vars) => {
      setPunchError(null);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MobileHomeResponse>(key);
      if (previous) {
        queryClient.setQueryData<MobileHomeResponse>(key, {
          ...previous,
          today: optimisticToday(previous.today, vars.punchedAt),
        });
      }
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<MobileHomeResponse>(key, (old) =>
        old ? { ...old, today: data.today } : old
      );
    },
    onError: (error, _vars, context) => {
      if (is4xx(error)) {
        // Deterministic rejection: roll back the optimistic flip and surface it.
        if (context?.previous) {
          queryClient.setQueryData<MobileHomeResponse>(key, context.previous);
        }
        setPunchError(punchErrorCopy(error));
      }
      // Network / 5xx: enqueue + keep optimistic state. Handled in `punch()`
      // (which owns the frozen clientEventId/punchedAt) rather than here so the
      // exact tapped values are what land in the queue.
    },
  });

  /**
   * Drain the queue oldest-first. Guarded so a NetInfo-reconnect and an
   * AppState-foreground firing together can't run two drains concurrently
   * (which would double-POST — harmless on the server thanks to idempotency,
   * but wasteful and could double-remove). Stops at the first transient
   * failure and retries on the next trigger; drops 4xx-rejected items.
   */
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      const items = queue.peekAll();
      if (items.length === 0) {
        setQueueCount(0);
        setDrainFailures(0);
        return;
      }
      let transientFailure = false;
      for (const item of items) {
        try {
          const res = await apiFetch<MobilePunchResponse>(
            PUNCH_PATH,
            {
              method: "POST",
              body: JSON.stringify({
                clientEventId: item.clientEventId,
                punchedAt: item.punchedAt,
                lat: item.lat ?? null,
                lng: item.lng ?? null,
              } satisfies MobilePunchRequest),
            },
            orgId
          );
          queue.remove(item.clientEventId);
          queryClient.setQueryData<MobileHomeResponse>(key, (old) =>
            old ? { ...old, today: res.today } : old
          );
        } catch (error) {
          if (is4xx(error)) {
            // Deterministic rejection (e.g. a punch queued > 24h → clock_skew):
            // drop it, surface, and keep draining the rest.
            queue.remove(item.clientEventId);
            setPunchError(punchErrorCopy(error));
          } else {
            // Still offline / server transient — stop; retry on next trigger.
            transientFailure = true;
            break;
          }
        }
      }
      setQueueCount(queue.peekAll().length);
      setDrainFailures((n) => (transientFailure ? n + 1 : 0));
    } finally {
      draining.current = false;
    }
  }, [apiFetch, orgId, queue, queryClient, key]);

  // Drain on reconnect AND on app foreground. Both are natural "we might be
  // online now" signals; the concurrency guard makes overlapping fires safe.
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      if (state.isConnected) void drain();
    });
    const appSub = AppState.addEventListener("change", (status) => {
      if (status === "active") void drain();
    });
    return () => {
      unsubNet();
      appSub.remove();
    };
  }, [drain]);

  /**
   * Tap handler. Mints the clientEventId + punchedAt ONCE, here, and freezes
   * them: the same values are replayed by the drain so the server dedupes an
   * eventual retry against the first attempt.
   */
  const punch = useCallback(async () => {
    const vars: PunchVars = {
      clientEventId: Crypto.randomUUID(),
      punchedAt: new Date().toISOString(),
    };
    try {
      await mutation.mutateAsync(vars);
    } catch (error) {
      // A 4xx is already surfaced + rolled back in onError — nothing to queue.
      if (is4xx(error)) return;
      // Network / 5xx: freeze this punch into the queue for the drain.
      const queued: QueuedPunch = { ...vars, queuedAt: Date.now() };
      queue.enqueue(queued);
      setQueueCount(queue.peekAll().length);
    }
  }, [mutation, queue]);

  return {
    punch,
    isPunching: mutation.isPending,
    queueCount,
    /** True once transient drains have failed enough to warrant a banner. */
    showSyncFailedBanner: drainFailures >= DRAIN_FAILURE_BANNER_THRESHOLD,
    punchError,
    clearPunchError: useCallback(() => setPunchError(null), []),
  };
}
