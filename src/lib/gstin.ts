const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGSTIN(value: string): boolean {
  if (!value) return false;
  return GSTIN_REGEX.test(value.trim().toUpperCase());
}

export function normalizeGSTIN(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return isValidGSTIN(normalized) ? normalized : null;
}
