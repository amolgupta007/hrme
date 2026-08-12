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
import { attendanceMonthQueryKey, currentIstMonth } from "@/lib/attendance";
import { createOfflineQueue, type QueuedPunch } from "@/lib/offline-queue";
import { acquireLocation, locationOutcomeMessage } from "@/lib/location";
import { punchFeedback } from "@/lib/haptics";
import { strings } from "@/lib/i18n";

const PUNCH_PATH = "/api/mobile/attendance/punch";

/** Consecutive failed drains before we surface the persistent "can't sync" banner. */
const DRAIN_FAILURE_BANNER_THRESHOLD = 3;

/**
 * A 4xx from the BFF is *usually* a deterministic rejection (bad body, clock
 * skew, attendance disabled, inactive employee) — replaying the same punch
 * will always fail, so `onError` surfaces it immediately. A network error or
 * a 5xx is transient: the punch is queued (idempotent on `clientEventId`)
 * and replayed on reconnect/foreground.
 */
function is4xx(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status >= 400 && error.status < 500;
}

/**
 * Whether a 4xx should be treated as *permanent* — dropped from the offline
 * queue and never retried. Excludes 401: an expired/refreshing Clerk token
 * is a transient condition (a fresh token on the next attempt can succeed),
 * not a rejection of the punch itself, so a 401'd punch must stay queued and
 * be retried exactly like a network error or a 5xx — same as `is4xx` in
 * every other case, just carved out for 401.
 */
function isPermanentRejection(error: unknown): boolean {
  if (!is4xx(error)) return false;
  // 401: an expired/refreshing Clerk token is transient — a fresh token on the
  // next attempt can succeed.
  if (error.status === 401) return false;
  // `location_required`: the org flipped to required mode AFTER this punch was
  // queued (a fresh punch in required mode never enqueues without coordinates —
  // `punch()` returns before enqueueing). Dropping it would DESTROY a real
  // clock-in that already happened, and a lost attendance record feeds the
  // rollup and payroll LOP. A stuck queue entry is recoverable; a deleted punch
  // is not — so it stays queued, and drains if the admin relaxes the policy.
  if (error.code === "location_required") return false;
  return true;
}

/** Human copy for the BFF error codes a punch can return (4xx surface path). */
function punchErrorCopy(error: unknown): string {
  const code = error instanceof ApiError ? error.code : "network_error";
  switch (code) {
    case "clock_skew":
      return strings.punch.errors.clockSkew;
    case "attendance_disabled":
      return strings.punch.errors.attendanceDisabled;
    case "inactive_employee":
    case "no_employee":
      return strings.punch.errors.inactiveEmployee;
    case "no_membership":
      return strings.punch.errors.noMembership;
    case "location_required":
      return strings.punch.errors.locationRequired;
    default:
      return strings.punch.errors.generic;
  }
}

/** The org's Location-verified clock-in configuration, as served by `/me`. */
export type LocationPunchConfig = { enabled: boolean; mode: "optional" | "required" };

const LOCATION_OFF: LocationPunchConfig = { enabled: false, mode: "optional" };

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
  locationPunch = LOCATION_OFF,
}: {
  namespace: string;
  orgId: string | null | undefined;
  /**
   * From `/api/mobile/me`. Defaults to off so a stale persisted `me` payload
   * (pre-D5, with no `attendance` key) can never make the app ask for location.
   */
  locationPunch?: LocationPunchConfig;
}) {
  const apiFetch = useApi();
  const queryClient = useQueryClient();
  const queue = useMemo(() => createOfflineQueue(namespace), [namespace]);

  const [queueCount, setQueueCount] = useState(() => queue.peekAll().length);
  const [drainFailures, setDrainFailures] = useState(0);
  const [punchError, setPunchError] = useState<string | null>(null);
  /**
   * A punch that DID record but is worth mentioning — e.g. location permission
   * was denied in `optional` mode, so it went in untagged. Deliberately a
   * separate channel from `punchError`: rendering a successful clock-in through
   * the red failure banner tells someone their punch didn't work when it did,
   * and the employee's likely reaction (tap again) makes it worse.
   */
  const [punchNotice, setPunchNotice] = useState<string | null>(null);
  /** True while a GPS fix is being acquired, before the mutation starts. */
  const [acquiring, setAcquiring] = useState(false);
  /**
   * Re-entry guard spanning the whole punch operation (acquire + send).
   * A ref, not the `acquiring` state, because taps land faster than React
   * re-renders and the second tap must be rejected synchronously.
   */
  const busy = useRef(false);
  const draining = useRef(false);
  /**
   * clientEventIds whose FIRST (immediate, at-tap) POST is still in flight.
   * A punch is enqueued BEFORE its POST (durability — see `punch()`), so the
   * entry exists in the queue during its own request; the drain filters these
   * out so a reconnect/foreground trigger can never double-send an in-flight
   * punch, and the Syncing badge doesn't flicker on every successful online
   * punch (the badge counts only entries NOT in flight).
   */
  const inFlight = useRef<Set<string>>(new Set());

  /** Queue entries truly *waiting* for the drain (not currently being POSTed). */
  const pendingCount = useCallback(
    () =>
      queue.peekAll().filter((p) => !inFlight.current.has(p.clientEventId))
        .length,
    [queue]
  );

  // Re-sync the badge to the NEW queue when the identity changes (queue is
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

  /**
   * A recorded punch changes today's attendance day — nudge the current IST
   * month's calendar query so a mounted Attendance screen reflects it. Cheap
   * and guarded to exactly one key (the live month); no-op when that query
   * isn't cached/mounted. Past months never change from a punch, so they're
   * left untouched.
   */
  const invalidateCurrentMonth = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: attendanceMonthQueryKey(orgId, currentIstMonth()),
    });
  }, [queryClient, orgId]);

  const mutation = useMutation<MobilePunchResponse, unknown, PunchVars, PunchContext>({
    mutationFn: (vars) =>
      apiFetch<MobilePunchResponse>(
        PUNCH_PATH,
        { method: "POST", body: JSON.stringify(vars) },
        orgId
      ),
    onMutate: async (vars) => {
      // Safe to clear again: a location warning in `optional` mode now lands on
      // the separate `punchNotice` channel, so there is nothing here that this
      // reset could wipe. (An earlier revision had to skip this, which let a
      // stale error from one action bleed into an unrelated mutation.)
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
      invalidateCurrentMonth();
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
   * failure (network, 5xx, or 401) and retries on the next trigger; drops
   * only permanently-rejected (non-401) 4xx items.
   */
  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      // Skip entries whose first (at-tap) POST is still in flight — replaying
      // one now would double-send it (harmless server-side via clientEventId
      // dedupe, but wasteful and it could race the immediate handler's
      // remove-on-success).
      const items = queue
        .peekAll()
        .filter((p) => !inFlight.current.has(p.clientEventId));
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
              // Replays the frozen bytes verbatim, coordinates included — the
              // location where the punch happened, not where the phone is now.
              body: JSON.stringify({
                clientEventId: item.clientEventId,
                punchedAt: item.punchedAt,
                lat: item.lat ?? null,
                lng: item.lng ?? null,
                accuracyM: item.accuracyM ?? null,
              } satisfies MobilePunchRequest),
            },
            orgId
          );
          queue.remove(item.clientEventId);
          queryClient.setQueryData<MobileHomeResponse>(key, (old) =>
            old ? { ...old, today: res.today } : old
          );
          invalidateCurrentMonth();
        } catch (error) {
          if (isPermanentRejection(error)) {
            // Deterministic rejection (e.g. a punch queued > 24h → clock_skew):
            // drop it, surface, and keep draining the rest.
            queue.remove(item.clientEventId);
            setPunchError(punchErrorCopy(error));
          } else {
            // Still offline / server transient / 401 token blip — stop;
            // retry on next trigger. The entry stays queued.
            transientFailure = true;
            break;
          }
        }
      }
      setQueueCount(pendingCount());
      setDrainFailures((n) => (transientFailure ? n + 1 : 0));
    } finally {
      draining.current = false;
    }
  }, [apiFetch, orgId, queue, queryClient, key, pendingCount, invalidateCurrentMonth]);

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

  // Kick a drain pass on mount and whenever the active org changes. The org
  // switch case (same identity → same queue instance, so the render-adjust
  // above doesn't fire) matters because `query.tsx` wipes this identity's
  // queue store in ITS effect — the setTimeout defers past that wipe, and the
  // drain's empty-queue branch then resets queueCount + drainFailures, so no
  // stale "Syncing" badge survives an org switch. On mount it also replays any
  // punches left over from a previous app run without waiting for a
  // reconnect/foreground event.
  useEffect(() => {
    const id = setTimeout(() => void drain(), 0);
    return () => clearTimeout(id);
  }, [orgId, drain]);

  /**
   * Tap handler. Mints the clientEventId + punchedAt ONCE, here, freezes them,
   * and enqueues BEFORE attempting the POST — so a process kill mid-request
   * can never lose the punch (on relaunch the entry is still in MMKV and the
   * mount/reconnect drain replays it; if the killed request had actually
   * reached the server, the replay is deduped on clientEventId → idempotent
   * SUCCESS). The entry is removed on success or on a permanent (non-401)
   * 4xx rejection; it stays queued for network/5xx failures and for a 401
   * (transient token blip — never permanently rejected).
   */
  /**
   * Mint, persist, then send one punch.
   *
   * The clientEventId and punchedAt are minted ONCE here and frozen, and the
   * entry is enqueued BEFORE the POST — so a process kill mid-request can never
   * lose the punch (on relaunch it is still in MMKV and the mount/reconnect
   * drain replays it; if the killed request had actually reached the server the
   * replay is deduped on clientEventId → idempotent success).
   *
   * Removed on success or on a permanent rejection; it stays queued for
   * network/5xx failures, for a 401 token blip, and for `location_required`
   * (see `isPermanentRejection`).
   */
  const sendPunch = useCallback(
    async (coords: { lat?: number | null; lng?: number | null; accuracyM?: number | null }) => {
      const vars: PunchVars = {
        clientEventId: Crypto.randomUUID(),
        punchedAt: new Date().toISOString(),
        ...coords,
      };
      const queued: QueuedPunch = { ...vars, queuedAt: Date.now() };
      queue.enqueue(queued);
      // Marked in-flight so the drain won't replay it while this immediate POST
      // is still pending (and so the Syncing badge doesn't count it).
      inFlight.current.add(vars.clientEventId);
      try {
        await mutation.mutateAsync(vars);
        queue.remove(vars.clientEventId);
      } catch (error) {
        if (isPermanentRejection(error)) {
          // Deterministic rejection (already rolled back + surfaced in onError)
          // — must never be retried, so drop it from the queue.
          queue.remove(vars.clientEventId);
        }
        // Everything else: leave the frozen entry queued for the drain.
      } finally {
        inFlight.current.delete(vars.clientEventId);
        setQueueCount(pendingCount());
      }
    },
    [mutation, queue, pendingCount],
  );

  const punch = useCallback(async () => {
    // Guard re-entry for the WHOLE operation, not just the mutation. Acquiring a
    // GPS fix can take up to ACQUIRE_TIMEOUT_MS, during which `mutation.isPending`
    // is still false — without this, a second tap during the wait mints a second
    // clientEventId and writes a duplicate punch event for one clock-in.
    if (busy.current) return;
    busy.current = true;
    setAcquiring(true);
    setPunchError(null);
    setPunchNotice(null);
    // Fire at TAP time, not after the fix: haptics acknowledge the press, and a
    // buzz arriving ten seconds later reads as a second, phantom action.
    punchFeedback();

    try {
      // Location is acquired BEFORE the timestamp is minted and frozen into the
      // queued entry alongside it. That ordering is the whole correctness story
      // for offline punches: a replay days later must carry the coordinates of
      // where the punch actually happened, not wherever the phone was when it
      // finally reconnected.
      let coords: { lat?: number | null; lng?: number | null; accuracyM?: number | null } = {};
      if (locationPunch.enabled) {
        const fix = await acquireLocation();
        if (fix.outcome === "ok") {
          coords = { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM };
        } else {
          const blocking = locationPunch.mode === "required";
          const message = locationOutcomeMessage(fix.outcome, blocking);
          // In `required` mode this really is a failure; in `optional` mode the
          // punch still succeeds, so it goes to the neutral notice channel —
          // reporting a recorded punch through the red error banner tells the
          // employee their clock-in failed when it did not.
          if (blocking) {
            setPunchError(message);
            // Stop before enqueueing: the server is certain to reject this, and
            // a queued 400 would just churn the drain loop.
            return;
          }
          setPunchNotice(message);
        }
      }

      await sendPunch(coords);
    } finally {
      busy.current = false;
      setAcquiring(false);
    }
  }, [sendPunch, locationPunch.enabled, locationPunch.mode]);

  return {
    punch,
    // Covers the GPS acquisition window as well as the request, so the button
    // is disabled and spinning for the entire operation.
    isPunching: acquiring || mutation.isPending,
    queueCount,
    /** True once transient drains have failed enough to warrant a banner. */
    showSyncFailedBanner: drainFailures >= DRAIN_FAILURE_BANNER_THRESHOLD,
    punchError,
    clearPunchError: useCallback(() => setPunchError(null), []),
    /** Non-failure information about a punch that DID record (e.g. untagged). */
    punchNotice,
    clearPunchNotice: useCallback(() => setPunchNotice(null), []),
  };
}
