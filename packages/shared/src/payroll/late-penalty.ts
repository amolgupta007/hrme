/**
 * Pure late-penalty deduction calc. Deduction = per-day salary × penalty days,
 * where per-day salary = gross_monthly / working_days (same rate as LOP). The
 * penalty reduces net pay only — it does NOT reduce taxable income (mirrors
 * lop_deduction). No DB, no I/O.
 */
import { resolvePenaltyDays, type PenaltyBand } from "@/lib/attendance/late-penalty-bands";

export function computeLatePenaltyDeduction(args: {
  lateDays: number;
  bands: PenaltyBand[];
  grossMonthly: number;
  workingDays: number;
}): { penaltyDays: number; deduction: number } {
  const penaltyDays = resolvePenaltyDays(args.lateDays, args.bands);
  if (penaltyDays <= 0 || args.workingDays <= 0) return { penaltyDays: 0, deduction: 0 };
  const perDay = args.grossMonthly / args.workingDays;
  return { penaltyDays, deduction: Math.round(perDay * penaltyDays) };
}
