"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPayslipView, type PayslipView } from "@/actions/payslips";
import type { PayslipAmount, PayslipField } from "@jambahr/shared/payroll/payslip";

interface Props {
  open: boolean;
  onClose: () => void;
  entryId: string;
}

const amt = (n: number) => n.toFixed(2);

function Fields({ rows }: { rows: PayslipField[] }) {
  return (
    <div className="space-y-0.5">
      {rows.map((r) => (
        <div key={r.label} className="flex">
          <span className="w-32 shrink-0">{r.label}</span>
          <span>:{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Lines({ rows, count }: { rows: PayslipAmount[]; count: number }) {
  const padded = [...rows, ...Array.from({ length: Math.max(0, count - rows.length) }, () => null)];
  return (
    <>
      {padded.map((r, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span>{r ? `${r.label.toUpperCase()}${r.detail ? ` (${r.detail.toUpperCase()})` : ""}` : " "}</span>
          <span className="tabular-nums">{r ? amt(r.amount) : ""}</span>
        </div>
      ))}
    </>
  );
}

/**
 * The pay slip on screen, in the same October layout as the PDF and the
 * email attachment (one PayslipDocument behind all three).
 */
export function PayslipDialog({ open, onClose, entryId }: Props) {
  const [view, setView] = useState<PayslipView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setView(null);
    setError(null);
    getPayslipView(entryId).then((r) => (r.success ? setView(r.data) : setError(r.error)));
  }, [open, entryId]);

  const doc = view?.doc;
  const count = doc ? Math.max(doc.earnings.length, doc.deductions.length) : 0;
  const rule = "border-t border-foreground/70";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <div className="flex items-center justify-between">
          <DialogTitle>Pay slip{view ? ` — ${view.month}` : ""}</DialogTitle>
          <Button asChild variant="outline" size="sm" disabled={!view}>
            <a href={`/api/payroll/payslips/${entryId}/pdf`}>
              <Download className="mr-2 h-4 w-4" />Download PDF
            </a>
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!doc && !error && (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading pay slip…</p>
        )}
        {doc && (
          <div className="space-y-1.5 border border-foreground/70 bg-background p-5 font-mono text-[11px] leading-snug text-foreground">
            {view?.runStatus === "draft" && (
              <p className="mb-2 rounded bg-amber-100 px-2 py-1 font-sans text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                Draft preview — this month isn&apos;t processed yet, so these figures can still change.
              </p>
            )}
            <div className="flex gap-4">
              {view?.logo && (
                // eslint-disable-next-line @next/next/no-img-element -- data: URL from the server
                <img src={view.logo} alt={`${doc.org.name} logo`} className="h-12 w-36 object-contain object-left" />
              )}
              <div>
                <p className="font-bold">{doc.org.name.toUpperCase()}</p>
                {doc.org.addressLines.map((l) => <p key={l}>{l}</p>)}
                {doc.org.contactLine && <p>{doc.org.contactLine}</p>}
                {doc.org.ids.length > 0 && <p>{doc.org.ids.map((i) => `${i.label}: ${i.value}`).join("   ")}</p>}
                <p className="mt-2">{doc.title}</p>
              </div>
            </div>
            <div className={rule} />
            <div className="grid grid-cols-2 gap-4">
              <Fields rows={doc.employeeLeft} />
              <Fields rows={doc.employeeRight} />
            </div>
            <div className={rule} />
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between"><span>PARTICULARS</span><span>EARNINGS</span></div>
              <div className="flex justify-between border-l border-foreground/70 pl-3"><span>PARTICULARS</span><span>DEDUCTIONS</span></div>
            </div>
            <div className={rule} />
            <div className="grid grid-cols-2 gap-4">
              <div><Lines rows={doc.earnings} count={count} /></div>
              <div className="border-l border-foreground/70 pl-3"><Lines rows={doc.deductions} count={count} /></div>
            </div>
            <div className={rule} />
            <div className="grid grid-cols-2 gap-4">
              <div className="flex justify-between"><span>TOTAL EARNINGS</span><span className="tabular-nums">{amt(doc.totalEarnings)}</span></div>
              <div className="flex justify-between border-l border-foreground/70 pl-3"><span>TOTAL DEDUCTIONS</span><span className="tabular-nums">{amt(doc.totalDeductions)}</span></div>
            </div>
            <div className={rule} />
            <div className="flex justify-between font-bold"><span>NET PAY</span><span className="tabular-nums">{amt(doc.netPay)}</span></div>
            <div className={rule} />
            <p>({doc.netPayInWords})</p>
            <div className={rule} />
            {doc.employerContributions && doc.employerContributions.length > 0 && (
              <>
                <div className="flex justify-between"><span>EMPLOYER CONTRIBUTIONS (PART OF CTC)</span><span>AMOUNT</span></div>
                <div className={rule} />
                <Lines rows={doc.employerContributions} count={doc.employerContributions.length} />
                {doc.ctcMonthly !== null && (
                  <div className="flex justify-between"><span>COST TO COMPANY THIS MONTH</span><span className="tabular-nums">{amt(doc.ctcMonthly)}</span></div>
                )}
                <div className={rule} />
              </>
            )}
            <div className="space-y-1 pt-3">
              {doc.footer.map((f) => <p key={f}>{f.toUpperCase()}</p>)}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
