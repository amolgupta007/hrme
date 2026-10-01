// Plain module (not "use client" / "use server" — gotcha #78/#85): shared by the
// set-password banner and its tests.

/** How long "Not now" on the set-password banner hides it. */
export const PASSWORD_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export const PASSWORD_PROMPT_STORAGE_KEY = "jambahr:password-prompt-dismissed-at";

export function shouldShowPasswordPrompt(input: {
  passwordEnabled: boolean;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (input.passwordEnabled) return false;
  if (input.dismissedAt === null || !Number.isFinite(input.dismissedAt)) return true;
  return input.now - input.dismissedAt >= PASSWORD_PROMPT_SNOOZE_MS;
}

