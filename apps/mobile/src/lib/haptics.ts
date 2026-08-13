/**
 * Haptic feedback (Mobile PRD-04 §3: "haptic feedback on punch, approve, submit").
 *
 * Feature-detected exactly like `location.ts` and `storage.ts`: `expo-haptics`
 * is a native module, so a dev build made before it was installed doesn't have
 * it. Every function here is fire-and-forget and swallows failures — a missing
 * buzz must never surface as an error, and haptics are unavailable on many
 * Android devices regardless of the build.
 */

type ExpoHaptics = typeof import("expo-haptics");

function loadModule(): ExpoHaptics | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-haptics") as ExpoHaptics;
  } catch {
    return null;
  }
}

function safely(run: (h: ExpoHaptics) => Promise<void>): void {
  const haptics = loadModule();
  if (!haptics) return;
  // Deliberately not awaited: haptics are decoration on an action that has
  // already happened, never something the user should wait for.
  void run(haptics).catch(() => {});
}

/** Clock in / clock out — the app's most physical action. */
export function punchFeedback(): void {
  safely((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium));
}

/** An approve/submit that succeeded. */
export function successFeedback(): void {
  safely((h) => h.notificationAsync(h.NotificationFeedbackType.Success));
}

/** A rejection, or an action that failed. */
export function errorFeedback(): void {
  safely((h) => h.notificationAsync(h.NotificationFeedbackType.Error));
}

/** A lighter confirmation — selection changes, sheet actions. */
export function selectionFeedback(): void {
  safely((h) => h.selectionAsync());
}
