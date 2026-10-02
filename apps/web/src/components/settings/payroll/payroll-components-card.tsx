"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Layers, Loader2, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { savePayrollComponents } from "@/actions/payroll-config";
import { validateComponents, type ComponentDef, type InputMode } from "@jambahr/shared/payroll/engine";
import type { VersionedComponent } from "@/lib/payroll/engine-config";
import { NormNote } from "./norm-note";
import { field, small } from "./styles";

const KIND_TITLE: Record<ComponentDef["kind"], string> = {
  earning: "Earnings",
  deduction: "Deductions",
  employer_contribution: "Employer contributions (part of CTC, not paid to the employee)",
};

const RULE_NAME: Record<string, string> = {
  epf: "EPF rule", esi: "ESI rule", pt: "Professional tax rule", lwf: "Labour welfare fund rule", tds: "Income tax rule",
};

const NORM_FOR: Record<string, string> = { BASIC: "component.basic_pct", HRA: "component.hra_pct", GRATUITY: "component.gratuity" };

function toCode(label: string) {
  const c = label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  return /^[A-Z]/.test(c) ? c : `X_${c}`.slice(0, 32);
}

export function PayrollComponentsCard({
  components: initial,
  inputMode,
  month,
  onSaved,
}: {
  components: VersionedComponent[];
  inputMode: InputMode;
  month: string;
  onSaved: () => void;
}) {
  const strip = (c: VersionedComponent): ComponentDef => {
    const { effectiveFromMonth: _m, isSystem: _s, ...rest } = c;
    return rest;
  };
  const start = useMemo(() => initial.map(strip).sort((a, b) => a.order - b.order), [initial]);
  const systemCodes = useMemo(() => new Set(initial.filter((c) => c.isSystem).map((c) => c.code)), [initial]);
  const [rows, setRows] = useState<ComponentDef[]>(start);
  const [from, setFrom] = useState(month);
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState<null | { kind: ComponentDef["kind"]; label: string; method: "fixed" | "pct_of" | "manual" }>(null);

  const problems = validateComponents(rows, inputMode);
  const dirty = JSON.stringify(rows) !== JSON.stringify(start);

  const update = (code: string, patch: Partial<ComponentDef>) =>
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...patch } : r)));

  function move(code: string, dir: -1 | 1) {
    setRows((rs) => {
      const r = rs.find((x) => x.code === code)!;
      const peers = rs.filter((x) => x.kind === r.kind).sort((a, b) => a.order - b.order);
      const i = peers.findIndex((x) => x.code === code);
      const j = i + dir;
      if (j < 0 || j >= peers.length) return rs;
      const a = peers[i], b = peers[j];
      return rs.map((x) => (x.code === a.code ? { ...x, order: b.order } : x.code === b.code ? { ...x, order: a.order } : x));
    });
  }

  function addCustom() {
    if (!adding || !adding.label.trim()) return;
    const code = toCode(adding.label);
    if (rows.some((r) => r.code === code)) return void toast.error(`A component called ${code} already exists`);
    const peers = rows.filter((r) => r.kind === adding.kind);
    const order = (peers.length ? Math.max(...peers.map((p) => p.order)) : 0) + 5;
    setRows((rs) => [
      ...rs,
      {
        code, label: adding.label.trim(), kind: adding.kind, method: adding.method,
        ...(adding.method === "fixed" ? { amount: 0 } : {}),
        ...(adding.method === "pct_of" ? { base: "BASIC", pct: 10 } : {}),
        prorate: adding.method !== "manual", taxable: true, enabled: true, showOnPayslip: adding.kind !== "employer_contribution", order,
      },
    ]);
    setAdding(null);
  }

  async function save() {
    setSaving(true);
    const res = await savePayrollComponents({ effectiveFromMonth: from, components: rows, reason: why || undefined });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(res.data.changed ? `Saved ${res.data.changed} change(s) from ${from}` : "No changes to save");
    setWhy("");
    onSaved();
  }

  const pctBases = (self: string) => [
    inputMode === "gross_first" ? { v: "GROSS", l: "gross salary" } : { v: "CTC", l: "CTC" },
    ...rows.filter((r) => r.kind === "earning" && r.enabled && r.code !== self).map((r) => ({ v: r.code, l: r.label })),
  ];

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Layers className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-semibold">Salary components</h3>
          <p className="text-sm text-muted-foreground">
            Switch components on or off, rename them, and set how each is worked out. Amounts here are defaults — each employee&apos;s own values are set on their salary.
            Switched-off components disappear from calculations and pay slips.
          </p>
        </div>
      </div>

      {(Object.keys(KIND_TITLE) as ComponentDef["kind"][]).map((kind) => {
        const list = rows.filter((r) => r.kind === kind).sort((a, b) => a.order - b.order);
        return (
          <section key={kind} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{KIND_TITLE[kind]}</h4>
              <button
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => setAdding({ kind, label: "", method: "fixed" })}
              >
                <Plus className="h-3.5 w-3.5" /> Add {kind === "earning" ? "an earning" : kind === "deduction" ? "a deduction" : "a contribution"}
              </button>
            </div>
            <ul className="divide-y rounded-md border">
              {list.map((c, i) => (
                <li key={c.code} className={`space-y-1 p-3 ${c.enabled ? "" : "bg-muted/40"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Switch checked={c.enabled} onCheckedChange={(v) => update(c.code, { enabled: v })} aria-label={`Use ${c.label}`} />
                    <input
                      className={`${small} w-48`} value={c.label} aria-label="Name on pay slip"
                      onChange={(e) => update(c.code, { label: e.target.value })}
                    />
                    <code className="text-[11px] text-muted-foreground">{c.code}</code>

                    <span className="ml-1 flex flex-wrap items-center gap-1.5 text-sm">
                      {c.method === "statutory" && <span className="rounded bg-muted px-2 py-0.5 text-xs">{RULE_NAME[c.rule ?? ""] ?? "Statutory"} (below)</span>}
                      {c.method === "balancing" && <span className="text-xs text-muted-foreground">Whatever is left of {inputMode === "gross_first" ? "gross" : "CTC"}</span>}
                      {c.method === "manual" && <span className="text-xs text-muted-foreground">Entered on each payroll run</span>}
                      {c.method === "fixed" && (
                        <>
                          <span className="text-xs text-muted-foreground">Default ₹</span>
                          <input
                            type="number" min={0} className={`${small} w-28`} value={c.amount ?? 0} aria-label={`${c.label} default monthly amount`}
                            onChange={(e) => update(c.code, { amount: Number(e.target.value) })}
                          />
                          <span className="text-xs text-muted-foreground">/ month</span>
                        </>
                      )}
                      {c.method === "pct_of" && (
                        <>
                          <input
                            type="number" min={0} max={100} step="0.01" className={`${small} w-20`} value={c.pct ?? 0} aria-label={`${c.label} percentage`}
                            onChange={(e) => update(c.code, { pct: Number(e.target.value) })}
                          />
                          <span className="text-xs text-muted-foreground">% of</span>
                          <select className={small} value={c.base} aria-label={`${c.label} is a percentage of`} onChange={(e) => update(c.code, { base: e.target.value })}>
                            {pctBases(c.code).map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                          </select>
                        </>
                      )}
                    </span>

                    <span className="ml-auto flex items-center gap-3 text-xs">
                      {kind === "earning" && c.method !== "manual" && (
                        <label className="flex items-center gap-1"><input type="checkbox" checked={c.prorate} onChange={(e) => update(c.code, { prorate: e.target.checked })} />Reduce for unpaid days</label>
                      )}
                      {kind === "earning" && (
                        <label className="flex items-center gap-1"><input type="checkbox" checked={c.taxable} onChange={(e) => update(c.code, { taxable: e.target.checked })} />Taxable</label>
                      )}
                      <label className="flex items-center gap-1"><input type="checkbox" checked={c.showOnPayslip} onChange={(e) => update(c.code, { showOnPayslip: e.target.checked })} />On pay slip</label>
                      <button aria-label={`Move ${c.label} up`} disabled={i === 0} onClick={() => move(c.code, -1)} className="disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                      <button aria-label={`Move ${c.label} down`} disabled={i === list.length - 1} onClick={() => move(c.code, 1)} className="disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    </span>
                  </div>
                  {c.enabled && NORM_FOR[c.code] && <NormNote normKey={NORM_FOR[c.code]} value={c.pct} />}
                  {c.enabled && c.method === "balancing" && <NormNote normKey="component.balancing" />}
                  {!systemCodes.has(c.code) && !initial.some((x) => x.code === c.code) && (
                    <button className="text-xs text-muted-foreground hover:underline" onClick={() => setRows((rs) => rs.filter((r) => r.code !== c.code))}>
                      Remove (not saved yet)
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {adding?.kind === kind && (
              <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
                <div>
                  <label className="block text-xs font-medium" htmlFor={`add-${kind}`}>Name</label>
                  <input id={`add-${kind}`} autoFocus className={`${small} w-56`} value={adding.label} onChange={(e) => setAdding({ ...adding, label: e.target.value })} placeholder="e.g. Food allowance" />
                </div>
                <div>
                  <label className="block text-xs font-medium" htmlFor={`add-m-${kind}`}>Worked out as</label>
                  <select id={`add-m-${kind}`} className={small} value={adding.method} onChange={(e) => setAdding({ ...adding, method: e.target.value as "fixed" | "pct_of" | "manual" })}>
                    <option value="fixed">A fixed amount each month</option>
                    <option value="pct_of">A percentage of another component</option>
                    <option value="manual">Entered on each payroll run</option>
                  </select>
                </div>
                <button className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground" onClick={addCustom}>Add</button>
                <button className="h-8 px-2 text-sm text-muted-foreground" onClick={() => setAdding(null)}>Cancel</button>
              </div>
            )}
          </section>
        );
      })}

      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-md bg-destructive/10 p-3 pl-6 text-sm text-destructive">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-3 border-t pt-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="pc-from">Applies from pay month</label>
          <input id="pc-from" type="month" className={`${field} w-44`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="min-w-[14rem] flex-1">
          <label className="block text-sm font-medium" htmlFor="pc-why">Reason (kept in the change log)</label>
          <input id="pc-why" className={field} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Optional" />
        </div>
        <button
          onClick={save}
          disabled={!dirty || problems.length > 0 || saving}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save components
        </button>
      </div>
    </div>
  );
}
