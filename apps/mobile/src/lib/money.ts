import { Platform } from "react-native";
import { formatINR } from "@jambahr/shared";

/**
 * Money presentation for mobile (design spec §money): monospaced, Indian digit
 * grouping (₹2,51,200), deductions in danger red with a leading minus. The
 * grouping + ₹ symbol come from the shared `formatINR`; this module only owns
 * the mobile font family + the signed-deduction string. Colour is applied at
 * the call site (danger for deductions) — this returns text only.
 */

/** Reliable monospace family for money/duration readouts (matches day-detail). */
export const MONO = Platform.select({ ios: "Menlo", default: "monospace" }) as string;

export { formatINR };

/**
 * A deduction amount as a signed string, e.g. `−₹1,800`. A zero (or negative)
 * input renders without the leading minus so a "no deduction" row reads `₹0`.
 */
export function formatDeduction(amount: number): string {
  return amount > 0 ? `−${formatINR(amount)}` : formatINR(amount);
}
