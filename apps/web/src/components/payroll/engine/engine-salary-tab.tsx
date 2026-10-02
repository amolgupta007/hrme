"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, UserX } from "lucide-react";
import { computePayslip, effectiveComponents, pickEffective, projectAnnualCtc } from "@jambahr/shared/payroll/engine";
import { getSalaryEditorView, type SalaryEditorView, type SalaryEmployee } from "@/actions/payroll-salary";
import { toEmployeeInput } from "@/lib/payroll/engine-salary";
import { formatINR } from "@/lib/ctc";
import { SalaryRevisionDialog } from "./salary-revision-dialog";

const inr = (n: number) => formatINR(Math.round(n));

/** Payroll → Salary structures, for orgs that have set up the payroll engine. Loads its own state. */
export function EngineSalaryTab() {
  const [view, setView] = useState<SalaryEditorView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SalaryEmployee | null>(null);

  const load = useCallback(async () => {
    const res = await getSalaryEditorView();
    if (!res.success) return void setError(res.error);
    setError(null);
    setView(res.data);
    setEditing((e) => (e ? res.data.employees.find((x) => x.id === e.id) ?? null : null));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!view) return [];
    const { config, month } = view;
    const comps = effectiveComponents(config.components, month);
    return view.employees
      .filter((e) => !e.payrollExcluded && e.status !== "inactive")
      .map((e) => {
        const rev = pickEffective(view.revisions.filter((r) => r.employeeId === e.id), month);
        if (!rev) return { e, rev: null };
        try {
          const employee = toEmployeeInput(rev, e);
          const base = { settings: config.settings, components: comps, rules: config.rules };
          const slip = computePayslip({ ...base, employee: { ...employee, dateOfJoining: null, dateOfLeaving: null }, run: { month } });
          return { e, rev, slip, annual: projectAnnualCtc({ ...base, employee, month }) };
        } catch (err) {
          return { e, rev, error: err instanceof Error ? err.message : "Can't calculate" };
        }
      });
  }, [view]);

  if (error) return <p className="rounded-lg border p-4 text-sm text-destructive">{error}</p>;
  if (!view) {
    return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading salaries…</p>;
  }

  const gross = view.config.settings.inputMode === "gross_first";
  const missing = rows.filter((r) => !r.rev).length;
  const excluded = view.employees.filter((e) => e.payrollExcluded);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Salaries as of {view.month}. Each change is saved from a pay month you choose, and earlier months keep the salary they had.
        {gross ? " Salaries are entered as a fixed monthly gross; CTC is worked out." : " Salaries are entered as annual CTC."}
      </p>
      {missing > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {missing} employee{missing > 1 ? "s don't" : " doesn't"} have a salary yet.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Employee</th>
              <th className="px-4 py-3 text-right font-medium">Monthly gross</th>
              <th className="px-4 py-3 text-right font-medium">Net this month</th>
              <th className="px-4 py-3 text-right font-medium">Annual CTC</th>
              <th className="px-4 py-3 text-left font-medium">Since</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.e.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <p className="font-medium">{r.e.firstName} {r.e.lastName}</p>
                  {r.e.designation && <p className="text-xs text-muted-foreground">{r.e.designation}</p>}
                </td>
                {!r.rev ? (
                  <td colSpan={4} className="px-4 py-3 text-muted-foreground">No salary yet</td>
                ) : "error" in r && r.error ? (
                  <td colSpan={4} className="px-4 py-3 text-destructive">{r.error}</td>
                ) : "slip" in r && r.slip ? (
                  <>
                    <td className="px-4 py-3 text-right font-mono">{inr(r.slip.grossEarnings)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-primary">{inr(r.slip.netPay)}</td>
                    <td className="px-4 py-3 text-right font-mono">{inr(r.annual!)}<p className="text-xs text-muted-foreground">{(r.annual! / 100000).toFixed(2)} LPA</p></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.rev.effectiveFromMonth}</td>
                  </>
                ) : null}
                <td className="px-4 py-3 text-right">
                  <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setEditing(r.e)}>
                    <Pencil className="h-3.5 w-3.5" />{r.rev ? "Edit" : "Set salary"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {excluded.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            <UserX className="mr-1 inline h-4 w-4" />Not on this company&apos;s payroll ({excluded.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {excluded.map((e) => (
              <li key={e.id} className="flex items-center gap-3">
                <span className="w-48">{e.firstName} {e.lastName}</span>
                <span className="flex-1 text-muted-foreground">{e.payrollExcludedReason}</span>
                <button className="text-xs text-primary hover:underline" onClick={() => setEditing(e)}>Change</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && (
        <SalaryRevisionDialog
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          onSaved={() => void load()}
          employee={editing}
          revisions={view.revisions}
          month={view.month}
          config={view.config}
        />
      )}
    </div>
  );
}
