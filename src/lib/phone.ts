/**
 * Normalize a raw phone string to E.164.
 * India-first: bare 10-digit / 0-prefixed / 91-prefixed inputs become +91XXXXXXXXXX.
 * Already-E.164 numbers for any country are accepted as-is (8–15 digits after +).
 * Returns null when the input cannot be normalized to a valid number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already E.164 (any country): "+" then 8–15 digits.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return "+" + digits;
    return null;
  }

  // India local formats → strip non-digits, reduce to the 10-digit subscriber number.
  let local = trimmed.replace(/\D/g, "");
  if (local.length === 12 && local.startsWith("91")) local = local.slice(2);
  else if (local.length === 11 && local.startsWith("0")) local = local.slice(1);

  // Indian mobile subscriber numbers are 10 digits starting 6–9.
  if (local.length === 10 && /^[6-9]/.test(local)) return "+91" + local;
  return null;
}

export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null;
}
