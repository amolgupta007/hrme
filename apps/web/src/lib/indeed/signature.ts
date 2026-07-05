import { createHmac, timingSafeEqual } from "crypto";

/** Verify Indeed Apply's X-Indeed-Signature: base64 HMAC-SHA1 over the raw body. */
export function verifyIndeedSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha1", secret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
