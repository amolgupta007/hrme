/**
 * Minimum-supported-version gate (Mobile PRD-05 §6).
 *
 * Store apps live on people's phones for months. When a BFF contract changes in
 * a way old clients can't survive, the server needs a way to say "this build is
 * too old" — otherwise the only options are permanently supporting every
 * version ever shipped, or silently breaking users.
 *
 * Pure semver comparison lives here so both the server (which decides) and the
 * client (which renders the block) agree, and so the edge cases are tested once.
 */

export type MobileAppConfig = {
  /** Builds strictly below this are blocked. "0.0.0" = nothing is blocked. */
  minVersion: string;
  /** Newest published version, for a soft "update available" nudge. */
  latestVersion: string | null;
  /** Where to send someone to update (App Store / Play listing). */
  updateUrl: string | null;
  /** Optional override for the block screen's explanation. */
  message: string | null;
};

/**
 * Permissive by default, on purpose: a missing or malformed config must never
 * brick the app. Blocking users is an explicit act, never an accident of a
 * misread env var.
 */
export const DEFAULT_APP_CONFIG: MobileAppConfig = {
  minVersion: "0.0.0",
  latestVersion: null,
  updateUrl: null,
  message: null,
};

/** Parse "1.2.3" → [1,2,3]. Returns null for anything not shaped like semver. */
function parseVersion(version: string | null | undefined): [number, number, number] | null {
  if (typeof version !== "string") return null;
  // Tolerate a leading "v" and a pre-release/build suffix ("1.2.3-beta.1").
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return [parts[0], parts[1], parts[2]];
}

/** -1 / 0 / 1, or null if either side is unparseable. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i]! !== right[i]!) return left[i]! < right[i]! ? -1 : 1;
  }
  return 0;
}

/**
 * Should this build be blocked?
 *
 * Returns `false` whenever the answer is unclear — an unparseable current
 * version, an unparseable minimum, or no minimum at all. Fail-open is the only
 * safe posture: a parsing bug that locks every user out of an HR app during
 * working hours is far worse than an old client limping along one more day.
 */
export function isVersionBlocked(
  currentVersion: string | null | undefined,
  minVersion: string | null | undefined,
): boolean {
  if (!currentVersion || !minVersion) return false;
  const comparison = compareVersions(currentVersion, minVersion);
  if (comparison === null) return false;
  return comparison < 0;
}

/** Is a newer version published than the one running? (soft nudge only) */
export function isUpdateAvailable(
  currentVersion: string | null | undefined,
  latestVersion: string | null | undefined,
): boolean {
  if (!currentVersion || !latestVersion) return false;
  const comparison = compareVersions(currentVersion, latestVersion);
  return comparison !== null && comparison < 0;
}

/** Coerce env/JSON input into a valid config, degrading to permissive. */
export function normalizeAppConfig(raw: unknown): MobileAppConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APP_CONFIG };
  const obj = raw as Record<string, unknown>;

  const minVersion =
    typeof obj.minVersion === "string" && parseVersion(obj.minVersion)
      ? obj.minVersion.trim()
      : DEFAULT_APP_CONFIG.minVersion;

  return {
    minVersion,
    latestVersion:
      typeof obj.latestVersion === "string" && parseVersion(obj.latestVersion)
        ? obj.latestVersion.trim()
        : null,
    updateUrl:
      typeof obj.updateUrl === "string" && obj.updateUrl.startsWith("https://")
        ? obj.updateUrl.trim()
        : null,
    message:
      typeof obj.message === "string" && obj.message.trim().length > 0
        ? obj.message.trim()
        : null,
  };
}
