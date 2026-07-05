// Redacts common PII from stored assistant message text. Idempotent.
export function redactPII(text: string): string {
  if (!text) return text;
  let out = text;
  // Emails -> <EMAIL>
  out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<EMAIL>");
  // Indian phone numbers (+91 optional, 10 digits) -> <PHONE>
  out = out.replace(/(?:\+?91[-\s]?)?\b[6-9]\d{9}\b/g, "<PHONE>");
  // Rupee amounts (₹ or Rs / INR followed by a number) -> <AMOUNT>
  out = out.replace(/(?:₹|\bRs\.?\b|\bINR\b)\s?[\d,]+(?:\.\d+)?/gi, "<AMOUNT>");
  // Long bare digit sequences (>=5 digits — ids, account-like) -> <NUMBER>
  out = out.replace(/\b\d{5,}\b/g, "<NUMBER>");
  return out;
}
