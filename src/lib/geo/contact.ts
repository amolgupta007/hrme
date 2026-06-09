/**
 * Strip non-digit characters from a phone string and return a `wa.me/`
 * compatible numeric form, or null if the input is empty or has no digits.
 *
 * Operator behaviour: phone numbers in JambaGeo are entered free-text
 * ("+91 98765 43210", "9876543210", "+91-98765 43210"). WhatsApp's `wa.me`
 * deep link requires only digits (with optional country code). Indian
 * operators frequently omit the country code; we leave the digits as-is
 * rather than guessing +91, because guessing wrong sends the user to the
 * wrong country's WhatsApp account. If the digits don't include a country
 * code WhatsApp still routes to a contact-picker, which is a sane fallback.
 */
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits;
}
