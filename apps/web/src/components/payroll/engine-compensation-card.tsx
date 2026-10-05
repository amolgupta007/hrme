import { formatINR } from "@/lib/ctc";
import type { MyEngineCompensation } from "@/actions/payroll";
import type { CompensationLine } from "@/lib/payroll/my-compensation";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

function Lines({ title, lines, total, totalLabel }: { title: string; lines: CompensationLine[]; total: number; totalLabel: string }) {
  return (
    <div className="flex flex-col">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex-1 space-y-1.5 text-sm">
        {lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-4">
            <span className="min-w-0">{l.label}</span>
            <span className="shrink-0 tabular-nums">{formatINR(l.amount)}</span>
          </div>
        ))}
        {lines.length === 0 && <p className="text-muted-foreground">None</p>}
      </div>
      <div className="mt-3 flex justify-between gap-4 border-t border-border pt-2 text-sm font-medium">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{formatINR(total)}</span>
      </div>
    </div>
  );
}

/** My Compensation for payroll-engine orgs — the same calculation as the pay slip, for a full month. */
export function EngineCompensationCard({ data }: { data: MyEngineCompensation }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Monthly salary (gross)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{formatINR(data.grossMonthly)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Take-home (net)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{formatINR(data.netMonthly)}</p>
          </div>
          {data.ctcAnnual !== null && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Annual CTC</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{formatINR(data.ctcAnnual)}</p>
            </div>
          )}
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground sm:text-right">
          {data.designation && <p className="font-medium text-foreground">{data.designation}</p>}
          {data.department && <p>{data.department}</p>}
          <p>Effective from {monthLabel(data.effectiveFromMonth)}</p>
        </div>
      </div>

      <div className="grid gap-6 rounded-xl border border-border bg-card p-5 sm:grid-cols-2">
        <Lines title="Earnings" lines={data.earnings} total={data.grossMonthly} totalLabel="Gross salary" />
        <Lines title="Deductions" lines={data.deductions} total={data.deductionsMonthly} totalLabel="Total deductions" />
        <div className="flex justify-between gap-4 border-t border-border pt-3 text-base font-semibold sm:col-span-2">
          <span>Net take-home</span>
          <span className="tabular-nums">{formatINR(data.netMonthly)}</span>
        </div>
      </div>

      {data.employerContributions && data.employerContributions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <Lines
            title="Paid by the company on top of your salary"
            lines={data.employerContributions}
            total={data.ctcMonthly ?? data.grossMonthly}
            totalLabel="Cost to company this month"
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Your salary for {monthLabel(data.month)}, worked out the same way as your pay slip. A month with unpaid
        leave, or one you joined partway through, pays less. For questions about any component, contact your HR admin.
      </p>
    </div>
  );
}
