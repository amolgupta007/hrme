import { createAppStorage } from "@/lib/storage";
import { strings } from "@/lib/i18n";

/**
 * Location capture for Location-verified clock-in (Mobile D5).
 *
 * Two hard rules encoded here:
 *
 * 1. **Feature-detected, never platform-detected.** `expo-location` is a native
 *    module; a dev build made before it was installed simply doesn't have it,
 *    and `require` would throw at bundle-eval time. Same reasoning as
 *    `storage.ts`'s MMKV handling — the only reliable signal is "did the
 *    require succeed", not `Platform.OS`.
 * 2. **A failure here is never fatal.** Every path resolves to a `LocationFix`
 *    describing what happened; the caller decides. In `optional` mode the punch
 *    proceeds untagged; only `required` mode blocks, and only on the caller's
 *    explicit check.
 */

/** How long we're willing to make someone wait at the punch button. */
const ACQUIRE_TIMEOUT_MS = 10_000;

export type LocationOutcome =
  /** Coordinates acquired. */
  | "ok"
  /** The native module isn't in this build (needs an EAS rebuild). */
  | "unavailable"
  /** The user said no, at the OS prompt or in Settings. */
  | "denied"
  /** Location services are switched off device-wide. */
  | "services_off"
  /** Permission granted but no fix within the timeout. */
  | "timeout"
  /** Anything else (module threw). */
  | "error";

export type LocationFix = {
  outcome: LocationOutcome;
  lat: number | null;
  lng: number | null;
  /** Reported accuracy radius in metres, when the platform supplies one. */
  accuracyM: number | null;
};

const NO_FIX = (outcome: LocationOutcome): LocationFix => ({
  outcome,
  lat: null,
  lng: null,
  accuracyM: null,
});

type ExpoLocation = typeof import("expo-location");

function loadModule(): ExpoLocation | null {
  try {
    // Required, not imported: a build without the native module must fail HERE
    // (inside the try) rather than crashing the bundle at eval time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-location") as ExpoLocation;
  } catch {
    return null;
  }
}

/** Whether this build can capture location at all. */
export function isLocationAvailable(): boolean {
  return loadModule() !== null;
}

/**
 * Ask for foreground location permission.
 *
 * Only ever requests "when in use" — background location would be a materially
 * different privacy promise (and a much harder App Review conversation) for a
 * feature that needs exactly one fix per punch.
 *
 * iOS never re-prompts after the first decision, so a `denied` result means the
 * user must go to Settings; the caller's copy says so.
 */
export async function ensureLocationPermission(): Promise<LocationOutcome> {
  const Location = loadModule();
  if (!Location) return "unavailable";

  try {
    const existing = await Location.getForegroundPermissionsAsync();
    if (existing.granted) return "ok";
    // `canAskAgain: false` = already denied and the OS won't prompt again.
    if (!existing.canAskAgain) return "denied";

    const requested = await Location.requestForegroundPermissionsAsync();
    return requested.granted ? "ok" : "denied";
  } catch {
    return "error";
  }
}

/**
 * Acquire a single position fix.
 *
 * `Accuracy.Balanced` (~100m) rather than `High`: the geofences we compare
 * against are 200m+ by default, high accuracy costs seconds and battery at the
 * exact moment someone is waiting to clock in, and a coarser fix is the more
 * proportionate thing to collect. The server is told the accuracy and widens
 * the fence accordingly (capped), so precision loss doesn't silently push
 * people out of the office.
 */
export async function acquireLocation(): Promise<LocationFix> {
  const Location = loadModule();
  if (!Location) return NO_FIX("unavailable");

  const permission = await ensureLocationPermission();
  if (permission !== "ok") return NO_FIX(permission);

  try {
    if (!(await Location.hasServicesEnabledAsync())) return NO_FIX("services_off");
  } catch {
    // An older/partial module may not implement this — fall through and let
    // the position call decide rather than blocking on the probe.
  }

  try {
    const position = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      ACQUIRE_TIMEOUT_MS,
    );
    if (!position) return NO_FIX("timeout");

    const { latitude, longitude, accuracy } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return NO_FIX("error");
    }
    return {
      outcome: "ok",
      lat: latitude,
      lng: longitude,
      accuracyM:
        typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0
          ? accuracy
          : null,
    };
  } catch {
    return NO_FIX("error");
  }
}

/**
 * Resolve to `null` on timeout instead of hanging.
 *
 * `getCurrentPositionAsync` can wait indefinitely for a fix indoors; a punch
 * button that spins forever is worse than an untagged punch.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

// ── consent bookkeeping ─────────────────────────────────────────────────────

const CONSENT_KEY = "location-consent-shown";

/**
 * Whether the DPDP notice has been shown to this identity.
 *
 * Stored per-identity (and therefore wiped on sign-out with everything else)
 * so a shared device doesn't skip the notice for the next person.
 *
 * This tracks only that we *explained* — the OS permission remains the actual
 * consent, revocable at any time in Settings.
 */
export function hasSeenLocationNotice(namespace: string): boolean {
  return createAppStorage(namespace).getItem(CONSENT_KEY) === "1";
}

export function markLocationNoticeSeen(namespace: string): void {
  createAppStorage(namespace).setItem(CONSENT_KEY, "1");
}

/** User-facing copy for each non-`ok` outcome. */
export function locationOutcomeMessage(outcome: LocationOutcome, blocking: boolean): string {
  const copy = strings.location;
  const suffix = blocking
    ? copy.outcomeSuffix.blocking
    : copy.outcomeSuffix.nonBlocking;

  switch (outcome) {
    case "denied":
      return `${copy.outcome.denied}${suffix}`;
    case "services_off":
      return `${copy.outcome.servicesOff}${suffix}`;
    case "timeout":
      return `${copy.outcome.timeout}${suffix}`;
    case "unavailable":
      return `${copy.outcome.unavailable}${suffix}`;
    default:
      return `${copy.outcome.error}${suffix}`;
  }
}
