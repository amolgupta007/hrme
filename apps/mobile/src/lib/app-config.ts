import { useEffect, useState } from "react";
import Constants from "expo-constants";
import {
  DEFAULT_APP_CONFIG,
  isUpdateAvailable,
  isVersionBlocked,
  normalizeAppConfig,
  type MobileAppConfig,
} from "@jambahr/shared/mobile/app-config";
import { BASE_URL } from "@/lib/api";

/**
 * Version gate (PRD-05 §6). Fetched once at launch, BEFORE auth — an app too
 * old to speak the current BFF contract is precisely the app that can't be
 * trusted to sign in cleanly, so the check can't sit behind sign-in.
 *
 * Fails open at every step: no network, a non-2xx, a malformed body, or an
 * unparseable version all resolve to "not blocked". Locking an employee out of
 * clocking in because a config fetch timed out would be a far worse outcome
 * than an old client running one more day.
 */

/** The running build's version, from app.json's `expo.version`. */
export function currentAppVersion(): string | null {
  const version = Constants.expoConfig?.version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

const CONFIG_PATH = "/api/mobile/config";
const FETCH_TIMEOUT_MS = 6_000;

async function fetchAppConfig(): Promise<MobileAppConfig> {
  try {
    const res = await fetch(`${BASE_URL}${CONFIG_PATH}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { ...DEFAULT_APP_CONFIG };
    return normalizeAppConfig(await res.json());
  } catch {
    return { ...DEFAULT_APP_CONFIG };
  }
}

export type AppConfigState = {
  /** True until the first fetch settles. Callers should NOT block rendering. */
  loading: boolean;
  config: MobileAppConfig;
  /** This build is below the server's floor — show the hard block. */
  blocked: boolean;
  /** A newer build exists — soft nudge only. */
  updateAvailable: boolean;
  version: string | null;
};

export function useAppConfig(): AppConfigState {
  const [config, setConfig] = useState<MobileAppConfig>(DEFAULT_APP_CONFIG);
  const [loading, setLoading] = useState(true);
  const version = currentAppVersion();

  useEffect(() => {
    let cancelled = false;
    void fetchAppConfig().then((next) => {
      if (cancelled) return;
      setConfig(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    config,
    blocked: isVersionBlocked(version, config.minVersion),
    updateAvailable: isUpdateAvailable(version, config.latestVersion),
    version,
  };
}
