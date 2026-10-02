"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { INDIAN_STATES } from "@jambahr/shared/payroll/ctc";
import { computePayslip, projectAnnualCtc, pickEffective, type PayslipResult } from "@jambahr/shared/payroll/engine";
import { getPayrollEngineView } from "@/actions/payroll-config";
import {
  deleteSalaryRevision,
  savePayslipIds,
  saveSalaryRevision,
  setPayrollExclusion,
  type SalaryEmployee,
} from "@/actions/payroll-salary";
import type { PayrollConfig } from "@/lib/payroll/engine-config";
import type { SalaryRevision } from "@/lib/payroll/engine-salary";
import { formatINR } from "@/lib/ctc";

const field = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const inr = (n: number) => formatINR(Math.round(n * 100) / 100);

type Overrides = Record<string, { amount?: number; pct?: number }>;

export function SalaryRevisionDialog({
  open,
  onClose,
  onSaved,
  employee,
  revisions,
  month,
  config: initialConfig,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employee: SalaryEmployee;
  revisions: SalaryRevision[];
  month: string;
  config: PayrollConfig;
}) {
  const mine = useMemo(() => revisions.filter((r) => r.employeeId === employee.id), [revisions, employee.id]);
  const [from, setFrom] = useState(month);
  const [config, setConfig] = useState<PayrollConfig>(initialConfig);
  const [amount, setAmount] = useState("");
  const [ptState, setPtState] = useState<string>("");
  const [taxRegime, setTaxRegime] = useState<"new" | "old">("new");
  const [declared, setDeclared] = useState("0");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);
  const [excluded, setExcluded] = useState(employee.payrollExcluded);
  const [excludeReason, setExcludeReason] = useState(employee.payrollExcludedReason ?? "");

  // Settings/components can differ by month: load the ones for the chosen month.
  useEffect(() => {
    if (!open) return;
    if (from === month) return void setConfig(initialConfig);
    let live = true;
    getPayrollEngineView(from).then((res) => {
      if (live && res.success) setConfig(res.data.config);
    });
    return () => { live = false; };
  }, [from, month, initialConfig, open]);

  // Prefill from the revision in force for the chosen month, else the pre-engine structure.
  useEffect(() => {
    if (!open) return;
    const rev = pickEffective(mine, from);
    const legacy = employee.legacyDraft;
    const gross = config.settings.inputMode === "gross_first";
    if (rev) {
      setAmount(String((gross ? rev.monthlyGross : rev.annualCtc) ?? ""));
      setPtState(rev.ptState ?? "");
      setTaxRegime(rev.taxRegime);
      setDeclared(String(rev.declaredDeductionsAnnual));
      setOverrides(rev.overrides);
    } else if (legacy && !gross) {
      setAmount(String(legacy.annualCtc));
      setPtState(legacy.ptState ?? "");
      setTaxRegime(legacy.taxRegime);
      setDeclared(String(legacy.declaredDeductionsAnnual));
      setOverrides(legacy.overrides);
    } else {
      setAmount("");
      setPtState(legacy?.ptState ?? "maharashtra");
      setTaxRegime("new");
      setDeclared("0");
      setOverrides({});
    }
  }, [open, from, mine, employee.legacyDraft, config.settings.inputMode]);

  const gross = config.settings.inputMode === "gross_first";
  const amountNum = Number(amount.replace(/,/g, ""));
  const tdsOn = config.components.some((c) => c.enabled && c.rule === "tds");
  const editable = config.components.filter((c) => c.enabled && (c.method === "fixed" || c.method === "pct_of"));

  const preview = useMemo((): { slip: PayslipResult; annual: number } | { error: string } | null => {
    if (!amountNum || amountNum <= 0) return null;
    const emp = {
      employeeId: employee.id, gender: employee.gender, state: ptState || null, taxRegime,
      declaredDeductionsAnnual: Number(declared) || 0,
      ...(gross ? { monthlyGross: amountNum } : { annualCtc: amountNum }),
      overrides,
    };
    try {
      const base = { settings: config.settings, components: config.components, rules: config.rules, employee: emp };
      return { slip: computePayslip({ ...base, run: { month: from } }), annual: projectAnnualCtc({ ...base, month: from }) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Can't calculate this salary" };
    }
  }, [amountNum, employee.id, employee.gender, ptState, taxRegime, declared, gross, overrides, config, from]);

  function setOverride(code: string, key: "amount" | "pct", raw: string) {
    setOverrides((o) => {
      const next = { ...o };
      if (raw === "") delete next[code];
      else next[code] = { [key]: Number(raw) };
      return next;
    });
  }

  async function save() {
    setSaving(true);
    const res = await saveSalaryRevision({
      employeeId: employee.id, effectiveFromMonth: from,
      monthlyGross: gross ? amountNum : null, annualCtc: gross ? null : amountNum,
      taxRegime, declaredDeductionsAnnual: Number(declared) || 0, ptState: ptState || null,
      overrides, reason: why || undefined,
    });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(`Salary saved from ${from}`);
    res.data.warnings.forEach((w) => toast.warning(w));
    setWhy("");
    onSaved();
  }

  async function saveExclusion(next: boolean) {
    const res = await setPayrollExclusion({ employeeId: employee.id, excluded: next, reason: next ? excludeReason : undefined });
    if (!res.success) return void toast.error(res.error);
    setExcluded(next);
    toast.success(next ? "Excluded from payroll runs" : "Back on payroll");
    onSaved();
  }

  const section = (kind: "earning" | "deduction" | "employer_contribution") =>
    preview && "slip" in preview ? preview.slip.lines.filter((l) => l.kind === kind && (l.amount !== 0 || l.kind === "earning")) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Salary — {employee.firstName} {employee.lastName}
            {employee.designation && <span className="ml-2 text-sm font-normal text-muted-foreground">{employee.designation}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium" htmlFor="sr-from">Applies from pay month</label>
                <input id="sr-from" type="month" className={field} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium" htmlFor="sr-amount">{gross ? "Monthly salary (gross) ₹" : "Annual CTC ₹"}</label>
                <input id="sr-amount" inputMode="numeric" className={field} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))} placeholder={gross ? "e.g. 65000" : "e.g. 780000"} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium" htmlFor="sr-state">State (professional tax)</label>
                <select id="sr-state" className={field} value={ptState} onChange={(e) => setPtState(e.target.value)}>
                  <option value="">Not set</option>
                  {INDIAN_STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              {tdsOn && (
                <div>
                  <label className="text-sm font-medium" htmlFor="sr-regime">Tax regime</label>
                  <select id="sr-regime" className={field} value={taxRegime} onChange={(e) => setTaxRegime(e.target.value as "new" | "old")}>
                    <option value="new">New</option>
                    <option value="old">Old</option>
                  </select>
                </div>
              )}
            </div>
            {tdsOn && taxRegime === "old" && (
              <div>
                <label className="text-sm font-medium" htmlFor="sr-ded">Declared deductions per year ₹ (80C, 80D…)</label>
                <input id="sr-ded" inputMode="numeric" className={field} value={declared} onChange={(e) => setDeclared(e.target.value.replace(/[^\d]/g, ""))} />
              </div>
            )}

            {editable.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">This employee&apos;s amounts</p>
                <p className="text-xs text-muted-foreground">Leave blank to use the organisation default.</p>
                <ul className="divide-y rounded-md border">
                  {editable.map((c) => {
                    const key = c.method === "fixed" ? "amount" : "pct";
                    const def = c.method === "fixed" ? c.amount ?? 0 : c.pct ?? 0;
                    const cur = overrides[c.code]?.[key];
                    return (
                      <li key={c.code} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span>{c.label}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{c.method === "fixed" ? "₹/month" : `% of ${c.base === "GROSS" ? "gross" : c.base === "CTC" ? "CTC" : config.components.find((x) => x.code === c.base)?.label ?? c.base}`}</span>
                          <input
                            className="h-8 w-28 rounded-md border border-input bg-background px-2 text-right text-sm"
                            inputMode="decimal" aria-label={`${c.label} for this employee`}
                            placeholder={String(def)} value={cur ?? ""}
                            onChange={(e) => setOverride(c.code, key, e.target.value.replace(/[^\d.]/g, ""))}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div>
              <label className="text-sm font-medium" htmlFor="sr-why">Reason (kept in the change log)</label>
              <input id="sr-why" className={field} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Annual increment" />
            </div>
            <button
              onClick={save}
              disabled={saving || !preview || "error" in preview}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save salary from {from}
            </button>
          </div>

          {/* Live preview — the same engine that runs payroll */}
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Pay for {from} (full month)</p>
            {!preview && <p className="text-muted-foreground">Enter {gross ? "the monthly salary" : "the annual CTC"} to see the breakdown.</p>}
            {preview && "error" in preview && <p className="text-destructive">{preview.error}</p>}
            {preview && "slip" in preview && (
              <>
                {(["earning", "deduction", "employer_contribution"] as const).map((kind) => (
                  <div key={kind}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {kind === "earning" ? "Earnings" : kind === "deduction" ? "Deductions" : "Employer contributions"}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {section(kind).map((l) => (
                        <li key={l.code} className="flex justify-between gap-2">
                          <span>{l.label}{l.note ? <span className="text-xs text-muted-foreground"> ({l.note})</span> : null}</span>
                          <span className="font-mono">{inr(l.amount)}</span>
                        </li>
                      ))}
                      {section(kind).length === 0 && <li className="text-xs text-muted-foreground">None</li>}
                    </ul>
                  </div>
                ))}
                <div className="space-y-0.5 border-t pt-2">
                  <p className="flex justify-between font-semibold"><span>Net pay</span><span className="font-mono">{inr(preview.slip.netPay)}</span></p>
                  <p className="flex justify-between text-muted-foreground"><span>CTC this month</span><span className="font-mono">{inr(preview.slip.ctcMonthly)}</span></p>
                  <p className="flex justify-between text-muted-foreground"><span>Annual CTC (this financial year, month by month)</span><span className="font-mono">{inr(preview.annual)}</span></p>
                </div>
                {preview.slip.warnings.map((w) => <p key={w} className="text-xs text-amber-700 dark:text-amber-400">{w}</p>)}
              </>
            )}
          </div>
        </div>

        {mine.length > 0 && (
          <div className="space-y-1 border-t pt-4 text-sm">
            <p className="font-medium">Salary history</p>
            <ul className="space-y-1">
              {[...mine].reverse().map((r) => (
                <li key={r.id} className="flex items-center gap-3">
                  <button className="w-20 font-mono text-primary hover:underline" onClick={() => setFrom(r.effectiveFromMonth)}>{r.effectiveFromMonth}</button>
                  <span className="flex-1">{r.monthlyGross !== null ? `${inr(r.monthlyGross)} / month` : `${inr(r.annualCtc ?? 0)} / year`}</span>
                  <button
                    aria-label={`Remove the ${r.effectiveFromMonth} salary`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      const res = await deleteSalaryRevision({ revisionId: r.id });
                      if (!res.success) return void toast.error(res.error);
                      toast.success(`Removed the ${r.effectiveFromMonth} salary`);
                      onSaved();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <PayslipIdsForm employee={employee} onSaved={onSaved} />

        <div className="space-y-2 border-t pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Not on this company&apos;s payroll</p>
              <p className="text-xs text-muted-foreground">For staff paid by another entity. Payroll runs skip them and list them as excluded.</p>
            </div>
            <Switch
              checked={excluded}
              aria-label="Not on this company's payroll"
              onCheckedChange={(v) => (v ? setExcluded(true) : void saveExclusion(false))}
            />
          </div>
          {excluded && !employee.payrollExcluded && (
            <div className="flex gap-2">
              <input className={field} value={excludeReason} onChange={(e) => setExcludeReason(e.target.value)} placeholder="Why — e.g. On the payroll of another group company" />
              <button className="h-9 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50" disabled={!excludeReason.trim()} onClick={() => saveExclusion(true)}>
                Exclude
              </button>
            </div>
          )}
          {employee.payrollExcluded && <p className="text-xs text-muted-foreground">Reason: {employee.payrollExcludedReason}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PayslipIdsForm({ employee, onSaved }: { employee: SalaryEmployee; onSaved: () => void }) {
  const [v, setV] = useState({
    uan: employee.uan ?? "", pfNumber: employee.pfNumber ?? "", esicNumber: employee.esicNumber ?? "", workLocation: employee.workLocation ?? "",
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    v.uan !== (employee.uan ?? "") || v.pfNumber !== (employee.pfNumber ?? "") ||
    v.esicNumber !== (employee.esicNumber ?? "") || v.workLocation !== (employee.workLocation ?? "");
  const box = (label: string, k: keyof typeof v, placeholder: string) => (
    <div>
      <label className="text-xs font-medium" htmlFor={`pid-${k}`}>{label}</label>
      <input id={`pid-${k}`} className={field} value={v[k]} placeholder={placeholder} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
    </div>
  );
  return (
    <div className="space-y-2 border-t pt-4 text-sm">
      <p className="font-medium">Shown on the pay slip</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {box("UAN", "uan", "12 digits")}
        {box("PF number", "pfNumber", "e.g. MH/PUN/…")}
        {box("ESIC number", "esicNumber", "10–17 digits")}
        {box("Work location", "workLocation", "e.g. Pune")}
      </div>
      <button
        disabled={!dirty || saving}
        onClick={async () => {
          setSaving(true);
          const res = await savePayslipIds({ employeeId: employee.id, ...v });
          setSaving(false);
          if (!res.success) return void toast.error(res.error);
          toast.success("Saved");
          onSaved();
        }}
        className="inline-flex h-8 items-center rounded-md border px-3 text-sm disabled:opacity-50"
      >
        {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save details
      </button>
    </div>
  );
}
