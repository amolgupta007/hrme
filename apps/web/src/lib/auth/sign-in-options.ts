// Plain module (not "use client" / "use server" — gotcha #78/#85): shared by the
// set-password banner, the sign-in options email and its send script.

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

/**
 * "+919421195453" → "+91 ••••• •5453". Enough for someone to recognise their
 * own number without putting the whole thing in an email. Non-Indian or
 * malformed numbers keep only the last 4 digits.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ••••• •${last4}`;
  return `•••• ${last4}`;
}
