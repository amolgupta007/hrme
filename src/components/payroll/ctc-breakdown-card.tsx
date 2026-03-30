"use client";

import { computeCTCBreakdown, formatINR, type CTCBreakdown } from "@/lib/ctc";

interface CTCBreakdownCardProps {
  ctc: number;
  state: string;
  isMetro: boolean;
  includeHra?: boolean;
}

export function CTCBreakdownCard({ ctc, state, isMetro, includeHra = true }: CTCBreakdownCardProps) {
  if (!ctc || ctc <= 0) return null;

  const b = computeCTCBreakdown(ctc, state, isMetro, includeHra);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4 text-sm">
      {/* CTC Structure */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          CTC Breakdown (Annual)
        </p>
        <div className="space-y-1">
          <Row label="Basic Salary (40%)" value={b.basicAnnual} />
          {includeHra && (
            <Row label={`HRA (${isMetro ? "50%" : "40%"} of Basic)`} value={b.hraAnnual} />
          )}
          <Row label="Special Allowance" value={b.specialAllowanceAnnual} />
          <Row label="Employer PF" value={b.employerPfAnnual} muted />
          <Row label="Employer Gratuity (4.81%)" value={b.employerGratuityAnnual} muted />
          <div className="border-t border-border pt-1 mt-1">
            <Row label="Total CTC" value={b.ctc} bold />
          </div>
        </div>
      </div>

      {/* Monthly Take-Home */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Monthly Pay Slip Preview
        </p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Earnings</p>
          <Row label="Basic" value={b.basicMonthly} indent />
          {includeHra && <Row label="HRA" value={b.hraMonthly} indent />}
          <Row label="Special Allowance" value={b.specialAllowanceMonthly} indent />
          <Row label="Gross Salary" value={b.grossMonthly} bold />

          <p className="text-xs text-muted-foreground font-medium pt-2">Deductions</p>
          <Row label="Employee PF (12% of Basic)" value={b.employeePfMonthly} indent negative />
          <Row label={`Professional Tax (${state})`} value={b.ptMonthly} indent negative />
          <Row label="TDS (New Regime)" value={b.tdsMonthly} indent negative />
          <Row label="Total Deductions" value={b.totalDeductionsMonthly} negative />

          <div className="border-t border-primary/30 pt-1 mt-1">
            <Row label="Net Monthly Pay" value={b.netMonthly} highlight />
          </div>
        </div>
      </div>

      {/* Tax summary */}
      {b.annualTax > 0 && (
        <div className="rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Annual Tax (New Regime): {formatINR(b.annualTax)} on taxable income of{" "}
          {formatINR(b.annualTaxableIncome)} (after ₹75k std deduction + PF)
        </div>
      )}
      {b.annualTax === 0 && b.annualTaxableIncome > 0 && (
        <div className="rounded bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-3 py-2 text-xs text-green-800 dark:text-green-300">
          No TDS — taxable income ≤ ₹12L (Rebate u/s 87A applies)
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  indent,
  negative,
  highlight,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  indent?: boolean;
  negative?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center ${indent ? "pl-3" : ""} ${
        highlight ? "text-primary font-bold text-base" : ""
      }`}
    >
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span
        className={`font-mono ${bold ? "font-semibold" : ""} ${
          negative ? "text-destructive" : ""
        } ${muted ? "text-muted-foreground text-xs" : ""}`}
      >
        {negative ? "−" : ""}
        {formatINR(value)}
      </span>
    </div>
  );
}
