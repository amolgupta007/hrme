"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { formatINR } from "@/lib/ctc";
import type { PayrollEntry } from "@/actions/payroll";
import type { MyPayslip } from "@/actions/payroll";

type SlipData = (PayrollEntry & { month: string; employee_name: string }) | (MyPayslip & { employee_name: string });

interface Props {
  open: boolean;
  onClose: () => void;
  data: SlipData;
  orgName: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
}

export function PayslipDialog({ open, onClose, data, orgName }: Props) {
  const month = (data as any).month;
  const grossSalary = data.gross_salary;
  const bonus = data.bonus;
  const totalEarnings = grossSalary + bonus;

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <h2 className="text-lg font-semibold">Payslip — {getMonthLabel(month)}</h2>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>

        {/* Payslip content — printable */}
        <div id="payslip-content" className="space-y-4 text-sm">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-xl font-bold text-primary">{orgName}</p>
              <p className="text-muted-foreground text-xs mt-0.5">Pay Slip</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{getMonthLabel(month)}</p>
              <p className="text-muted-foreground text-xs">Pay Period</p>
            </div>
          </div>

          {/* Employee info */}
          <div className="grid grid-cols-2 gap-4 py-2 border-b border-border">
            <div>
              <p className="text-muted-foreground text-xs">Employee</p>
              <p className="font-semibold">{data.employee_name}</p>
            </div>
            {(data as any).department && (
              <div>
                <p className="text-muted-foreground text-xs">Department</p>
                <p className="font-medium">{(data as any).department}</p>
              </div>
            )}
          </div>

          {/* Earnings + Deductions */}
          <div className="grid grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Earnings
              </p>
              <div className="space-y-1.5">
                <SlipRow label="Basic Salary" value={data.basic_monthly} />
                <SlipRow label="House Rent Allowance" value={data.hra_monthly} />
                <SlipRow label="Special Allowance" value={data.special_allowance_monthly} />
                {bonus > 0 && <SlipRow label="Bonus" value={bonus} highlight />}
                <div className="border-t border-border pt-1.5 mt-1.5">
                  <SlipRow label="Gross Earnings" value={totalEarnings} bold />
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <p className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Deductions
              </p>
              <div className="space-y-1.5">
                <SlipRow label="Provident Fund (12%)" value={data.employee_pf} negative />
                <SlipRow label="Professional Tax" value={data.professional_tax} negative />
                <SlipRow label="TDS (Income Tax)" value={data.tds} negative />
                {data.lop_deduction > 0 && (
                  <SlipRow
                    label={`LOP (${data.lop_days} days)`}
                    value={data.lop_deduction}
                    negative
                  />
                )}
                <div className="border-t border-border pt-1.5 mt-1.5">
                  <SlipRow label="Total Deductions" value={data.total_deductions} bold negative />
                </div>
              </div>
            </div>
          </div>

          {/* Net Pay */}
          <div className="rounded-lg bg-primary/10 border border-primary/20 px-5 py-4 flex items-center justify-between mt-2">
            <div>
              <p className="text-sm text-muted-foreground">Net Pay (Take Home)</p>
              <p className="text-2xl font-bold text-primary mt-0.5">{formatINR(data.net_pay)}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{getMonthLabel(month)}</p>
              <p>New Tax Regime</p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
            This is a system-generated payslip from JambaHR. No signature required.
          </p>
        </div>

        {/* Print styles */}
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #payslip-content, #payslip-content * { visibility: visible; }
            #payslip-content { position: fixed; top: 0; left: 0; width: 100%; padding: 32px; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}

function SlipRow({
  label,
  value,
  bold,
  negative,
  highlight,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
  highlight?: boolean;
}) {
  if (value === 0 && !bold) return null;
  return (
    <div className="flex justify-between items-center text-sm">
      <span className={`text-muted-foreground ${highlight ? "text-primary font-medium" : ""}`}>
        {label}
      </span>
      <span
        className={`font-mono ${bold ? "font-semibold text-foreground" : ""} ${
          negative ? "text-destructive" : ""
        } ${highlight ? "text-primary" : ""}`}
      >
        {negative ? "−" : ""}
        {formatINR(value)}
      </span>
    </div>
  );
}
