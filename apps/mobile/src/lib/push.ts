import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { getClerkInstance } from "@clerk/clerk-expo";
import { ANDROID_CHANNELS } from "@jambahr/shared/mobile/push-channels";
import { BASE_URL } from "@/lib/api";
import { createAppStorage } from "@/lib/storage";

/**
 * Foreground presentation. SDK-57 shape per the installed `expo-notifications`
 * types (`shouldShowBanner`/`shouldShowList` are required; the legacy
 * `shouldShowAlert` is deprecated). Registered at module load so a handler is
 * always in place before any notification can arrive — matches the
 * expo-notifications recipe.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Android notification channels.
 *
 * Registered at module load, for the same reason as the handler above: a
 * notification can arrive before any screen mounts, and on Android 8+ one that
 * names a channel which doesn't exist yet is delivered on an auto-created
 * default-importance fallback — no heads-up banner, no sound, and nothing in
 * any log to say so.
 *
 * Ids and importances come from `@jambahr/shared` because the server names the
 * same channel in its push payload; a drift between the two is silent.
 *
 * Idempotent — `setNotificationChannelAsync` upserts. Note that Android treats
 * channel settings as immutable once the user has seen them, so changing an
 * importance means shipping a new channel id (hence the `_v1` suffixes), not
 * editing this call.
 */
async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Promise.all(
      ANDROID_CHANNELS.map((channel) =>
        Notifications.setNotificationChannelAsync(channel.id, {
          name: channel.name,
          description: channel.description,
          importance:
            channel.importance === "high"
              ? Notifications.AndroidImportance.HIGH
              : Notifications.AndroidImportance.DEFAULT,
          // Only the high-importance channel vibrates: an approval is worth a
          // buzz in a meeting, a payslip notification is not.
          vibrationPattern: channel.importance === "high" ? [0, 250, 250, 250] : undefined,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        }),
      ),
    );
  } catch (error) {
    log("ensureAndroidChannels failed", error);
  }
}

// Fire-and-forget at module load. Failure only costs channel metadata; it must
// never block the module from being imported.
void ensureAndroidChannels();

function log(context: string, error: unknown): void {
  if (__DEV__) {
    console.log(`[push] ${context}`, error);
  }
}

/**
 * `push.ts` fires from `session.tsx`'s auth-state effect and the profile
 * toggle — plain callers, not hooks — so it can't use `useApi()` (which
 * depends on `useAuth()`). This is Clerk's own documented outside-React
 * pattern for getting a session token: `getClerkInstance().session?.getToken()`.
 * Returns `null` (never throws) when there's no live session — e.g. mid
 * sign-out, when the token is about to become unobtainable anyway.
 */
async function getAuthToken(): Promise<string | null> {
  return (await getClerkInstance().session?.getToken()) ?? null;
}

async function postToBff(path: string, body: unknown, orgId?: string | null): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(orgId ? { "X-Org-Id": orgId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status}`);
  }
}

async function currentExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators/emulators have no Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Requests notification permission (only prompts if not already
 * granted/denied — iOS never re-prompts after the first decision) and
 * registers this device's Expo push token with the BFF. `orgId` is the
 * caller's active org, sent as `X-Org-Id` so the token row is stamped to the
 * right org for multi-org users (register/unregister write org-scoped rows —
 * same rule as any other mobile mutation). Best-effort: swallows every
 * error, since a failed registration just means no push until the next
 * sign-in/app-open/toggle retries it.
 */
export async function registerForPush(orgId?: string | null): Promise<void> {
  try {
    if (!Device.isDevice) return;
    // Respects the profile "Push notifications" toggle (defaults on) — a
    // user who turned it off must not get silently re-registered on their
    // next sign-in. The toggle's own "on" path flips the pref to true
    // BEFORE calling this, so it's never self-blocking.
    if (!isPushEnabledPref()) return;

    const existing = await Notifications.getPermissionsAsync();
    const granted = existing.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;

    const token = await currentExpoPushToken();
    if (!token) return;

    await postToBff("/api/mobile/push/register", { expoPushToken: token, platform: Platform.OS }, orgId);
  } catch (error) {
    log("registerForPush failed", error);
  }
}

/**
 * Best-effort unregister of this device's push token (sign-out, or the
 * profile toggle turned off). Re-derives the token instead of caching it —
 * cheap, and avoids a second piece of state to keep in sync. If permission
 * was never granted there's no token to unregister, so this is a no-op.
 *
 * `orgId` is the caller's active org, sent as `X-Org-Id` — same rule as
 * `registerForPush`. Without it the BFF falls back to the user's
 * first-created membership, which deletes zero rows (silent no-op) for any
 * multi-org user whose active org isn't their earliest one.
 *
 * Note: called from `session.tsx`'s `isSignedIn === false` effect, which by
 * definition runs after Clerk has already torn down the session — so
 * `getAuthToken()` may legitimately return `null` there and this becomes a
 * no-op. That's an accepted v1 gap (see plan's Global Constraint: push
 * writes are best-effort); the stale token row self-heals on the next
 * sign-in because `/api/mobile/push/register` upserts on the token value.
 */
export async function unregisterPush(orgId?: string | null): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) return;

    const token = await currentExpoPushToken();
    if (!token) return;

    await postToBff("/api/mobile/push/unregister", { expoPushToken: token }, orgId);
  } catch (error) {
    log("unregisterPush failed", error);
  }
}

// ── Local "push notifications" master toggle (profile screen) ──────────────
// Device-level preference (not per-Clerk-identity — mirrors the OS's own
// per-device notification setting), stored outside the identity-scoped
// storage namespaces so it survives sign-out/sign-in. v1 has no BFF field for
// this; it only gates whether THIS device calls registerForPush/unregisterPush.

const PUSH_PREF_STORAGE = createAppStorage("push-prefs");
const PUSH_PREF_KEY = "enabled";

/** Defaults to enabled — matches the automatic sign-in registration in `session.tsx`. */
export function isPushEnabledPref(): boolean {
  return PUSH_PREF_STORAGE.getItem(PUSH_PREF_KEY) !== "0";
}

export function setPushEnabledPref(enabled: boolean): void {
  PUSH_PREF_STORAGE.setItem(PUSH_PREF_KEY, enabled ? "1" : "0");
}
