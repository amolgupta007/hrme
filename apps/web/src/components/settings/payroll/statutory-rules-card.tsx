"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import { deleteOrgRule, saveOrgRule } from "@/actions/payroll-config";
import { INDIAN_STATES } from "@jambahr/shared/payroll/ctc";
import {
  resolveRule,
  type EpfParams,
  type EsiParams,
  type LwfParams,
  type PtParams,
  type StatutoryRuleKey,
  type TaxRegimeParams,
  type TdsParams,
} from "@jambahr/shared/payroll/engine";
import { ruleFromRow, type StatutoryRuleRow } from "@/lib/payroll/engine-config";
import { NormNote } from "./norm-note";
import { small } from "./styles";

const TITLES: Record<StatutoryRuleKey, string> = {
  epf: "Provident fund (EPF)",
  esi: "Employees' State Insurance (ESI)",
  pt: "Professional tax",
  lwf: "Labour welfare fund",
  tds: "Income tax (TDS)",
};
const STATE_RULES = new Set<StatutoryRuleKey>(["pt", "lwf"]);
const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const inr = (v: number | null | undefined) => (v === null || v === undefined ? "no limit" : `₹${v.toLocaleString("en-IN")}`);
const stateLabel = (j: string | null) => (j ? INDIAN_STATES.find((s) => s.value === j)?.label ?? j : "All states");

function summary(key: StatutoryRuleKey, p: unknown): string {
  switch (key) {
    case "epf": {
      const e = p as EpfParams;
      return `${e.eeRate}% employee + ${e.erRate}% employer on ${e.wageBase.join(" + ")}, ${e.wageCeiling === null ? "no ceiling" : `wages up to ${inr(e.wageCeiling)}`}${e.contributeAboveCeiling ? " (on full wages)" : ""}`;
    }
    case "esi": {
      const e = p as EsiParams;
      const m = { fixed_gross: "monthly gross", earned_gross: "earned gross", wage_base: "ESI wages" }[e.eligibility.measure];
      return `${e.eeRate}% + ${e.erRate}% on ${e.wageBase.join(" + ")}, while ${m} ≤ ${inr(e.eligibility.max)}`;
    }
    case "pt": {
      const e = p as PtParams;
      const slabs = e.slabs.map((s) => `${s.below === null ? "above" : `below ${inr(s.below)}`}: ₹${s.amount}`).join(", ");
      return `${slabs}${e.exemptions?.length ? `; exempt: ${e.exemptions.map((x) => `${x.gender.toLowerCase().startsWith("f") ? "women" : x.gender} below ${inr(x.below)}`).join(", ")}` : ""}${e.monthOverrides?.length ? `; ${e.monthOverrides.map((o) => `₹${o.fromAmount}→₹${o.toAmount} in ${MONTH_NAMES[Number(o.month) - 1]}`).join(", ")}` : ""}`;
    }
    case "lwf": {
      const e = p as LwfParams;
      return e.months.length ? `₹${e.eeAmount} employee + ₹${e.erAmount} employer in ${e.months.map((m) => MONTH_NAMES[Number(m) - 1]).join(" & ")}` : "No months set (nothing collected)";
    }
    case "tds": {
      const e = p as TdsParams;
      return `New regime: standard deduction ${inr(e.regimes.new.standardDeduction)}, no tax up to ${inr(e.regimes.new.rebateUpTo)}; cess ${e.cessPct}%`;
    }
  }
}

export function StatutoryRulesCard({
  orgRules,
  globalRules,
  month,
  earningCodes,
  onSaved,
}: {
  orgRules: StatutoryRuleRow[];
  globalRules: StatutoryRuleRow[];
  month: string;
  earningCodes: string[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<null | { key: StatutoryRuleKey; jurisdiction: string | null; params: unknown }>(null);
  const all = [...orgRules, ...globalRules].map(ruleFromRow);

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Landmark className="h-4 w-4" />
        </span>
        <div>
          <h3 className="font-semibold">Statutory rules</h3>
          <p className="text-sm text-muted-foreground">
            JambaHR keeps a standard version of each rule. Set your own where your organisation differs — yours wins from the month you choose,
            and each month&apos;s payroll uses the rule in force for that month, whenever it is processed.
          </p>
        </div>
      </div>

      {(Object.keys(TITLES) as StatutoryRuleKey[]).map((key) => {
        const jurisdictions = STATE_RULES.has(key)
          ? [...new Set([null, ...orgRules.filter((r) => r.rule_key === key).map((r) => r.jurisdiction), ...globalRules.filter((r) => r.rule_key === key).map((r) => r.jurisdiction)])]
          : [null];
        const own = orgRules.filter((r) => r.rule_key === key);
        return (
          <section key={key} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{TITLES[key]}</h4>
              <button
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  const j = STATE_RULES.has(key) ? "maharashtra" : null;
                  const cur = resolveRule(all, key, month, j);
                  setEditing({ key, jurisdiction: j, params: cur?.params ?? blank(key, earningCodes) });
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Set your own
              </button>
            </div>
            <ul className="space-y-1 text-sm">
              {jurisdictions.map((j) => {
                const r = resolveRule(all, key, month, j);
                if (!r || (j !== null && r.jurisdiction !== j)) return null;
                return (
                  <li key={j ?? "all"} className="flex flex-wrap items-baseline gap-2">
                    {STATE_RULES.has(key) && <span className="w-32 shrink-0 font-medium">{stateLabel(j)}</span>}
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${r.scope === "org" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {r.scope === "org" ? "Yours" : "JambaHR standard"}
                    </span>
                    <span className="text-muted-foreground">{summary(key, r.params)}</span>
                    <button className="text-xs text-primary hover:underline" onClick={() => setEditing({ key, jurisdiction: r.jurisdiction, params: r.params })}>
                      Edit
                    </button>
                  </li>
                );
              })}
              {resolveRule(all, key, month, null) === null && !STATE_RULES.has(key) && (
                <li className="text-muted-foreground">No rule yet — set your own to use this component.</li>
              )}
            </ul>
            <NormNote normKey={`rule.${key}`} month={month} value={resolveRule(all, key, month, STATE_RULES.has(key) ? "maharashtra" : null)?.params} />
            {own.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">Your versions ({own.length})</summary>
                <ul className="mt-1 space-y-1">
                  {own.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="w-20 font-mono">{r.effective_from_month}</span>
                      {STATE_RULES.has(key) && <span className="w-28">{stateLabel(r.jurisdiction)}</span>}
                      <span className="flex-1 text-muted-foreground">{summary(key, r.params)}</span>
                      <button
                        aria-label="Remove this version"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={async () => {
                          const res = await deleteOrgRule({ id: r.id });
                          if (!res.success) return void toast.error(res.error);
                          toast.success("Removed — the next version (or the JambaHR standard) applies");
                          onSaved();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {editing?.key === key && (
              <RuleEditor
                ruleKey={key}
                initialJurisdiction={editing.jurisdiction}
                initialParams={editing.params}
                month={month}
                earningCodes={earningCodes}
                onCancel={() => setEditing(null)}
                onSaved={() => { setEditing(null); onSaved(); }}
              />
            )}
          </section>
        );
      })}
    </div>
  );
}

function blank(key: StatutoryRuleKey, earnings: string[]): unknown {
  const base = earnings.includes("BASIC") ? ["BASIC"] : earnings.slice(0, 1);
  switch (key) {
    case "epf": return { eeRate: 12, erRate: 12, wageBase: base, wageCeiling: 15000, contributeAboveCeiling: false } satisfies EpfParams;
    case "esi": return { eeRate: 0.75, erRate: 3.25, wageBase: base, eligibility: { measure: "earned_gross", max: 21000 } } satisfies EsiParams;
    case "pt": return { measure: "earned_gross", slabs: [{ below: null, amount: 0 }] } satisfies PtParams;
    case "lwf": return { eeAmount: 0, erAmount: 0, months: [] } satisfies LwfParams;
    case "tds": return null;
  }
}

function RuleEditor({
  ruleKey, initialJurisdiction, initialParams, month, earningCodes, onCancel, onSaved,
}: {
  ruleKey: StatutoryRuleKey; initialJurisdiction: string | null; initialParams: unknown; month: string;
  earningCodes: string[]; onCancel: () => void; onSaved: () => void;
}) {
  const [p, setP] = useState<unknown>(structuredClone(initialParams));
  const [jurisdiction, setJurisdiction] = useState<string | null>(initialJurisdiction);
  const [from, setFrom] = useState(month);
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveOrgRule({ ruleKey, jurisdiction, effectiveFromMonth: from, params: p, reason: why || undefined });
    setSaving(false);
    if (!res.success) return void toast.error(res.error);
    toast.success(`${TITLES[ruleKey]}: your rule applies from ${from}`);
    onSaved();
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed bg-muted/30 p-3">
      {STATE_RULES.has(ruleKey) && (
        <div>
          <label className="block text-xs font-medium" htmlFor={`j-${ruleKey}`}>State</label>
          <select id={`j-${ruleKey}`} className={small} value={jurisdiction ?? ""} onChange={(e) => setJurisdiction(e.target.value || null)}>
            <option value="">All states (default)</option>
            {INDIAN_STATES.filter((s) => s.value !== "other").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      {ruleKey === "epf" && <EpfEditor p={p as EpfParams} set={setP} earnings={earningCodes} />}
      {ruleKey === "esi" && <EsiEditor p={p as EsiParams} set={setP} earnings={earningCodes} />}
      {ruleKey === "pt" && <PtEditor p={p as PtParams} set={setP} />}
      {ruleKey === "lwf" && <LwfEditor p={p as LwfParams} set={setP} />}
      {ruleKey === "tds" && <TdsEditor p={p as TdsParams} set={setP} />}

      <div className="flex flex-wrap items-end gap-2 border-t pt-3">
        <div>
          <label className="block text-xs font-medium" htmlFor={`f-${ruleKey}`}>Applies from pay month</label>
          <input id={`f-${ruleKey}`} type="month" className={`${small} w-40`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="block text-xs font-medium" htmlFor={`w-${ruleKey}`}>Reason (kept in the change log)</label>
          <input id={`w-${ruleKey}`} className={`${small} w-full`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. PF ceiling raised from Sep 2026" />
        </div>
        <button onClick={save} disabled={saving} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save rule
        </button>
        <button onClick={onCancel} className="h-8 px-2 text-sm text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}

// ── Per-rule editors ───────────────────────────────────────────────────────

type Setter = (v: unknown) => void;

function Num({ label, value, onChange, step, width = "w-28" }: { label: string; value: number | null; onChange: (v: number) => void; step?: string; width?: string }) {
  return (
    <label className="flex flex-col text-xs font-medium">
      {label}
      <input type="number" min={0} step={step ?? "any"} className={`${small} ${width} font-normal`} value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function BaseCodes({ value, onChange, earnings }: { value: string[]; onChange: (v: string[]) => void; earnings: string[] }) {
  return (
    <fieldset className="text-xs">
      <legend className="font-medium">Calculated on</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {earnings.map((c) => (
          <label key={c} className="flex items-center gap-1">
            <input type="checkbox" checked={value.includes(c)} onChange={(e) => onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))} />
            {c}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function EpfEditor({ p, set, earnings }: { p: EpfParams; set: Setter; earnings: string[] }) {
  const up = (patch: Partial<EpfParams>) => set({ ...p, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Num label="Employee %" value={p.eeRate} onChange={(v) => up({ eeRate: v })} width="w-20" />
      <Num label="Employer %" value={p.erRate} onChange={(v) => up({ erRate: v })} width="w-20" />
      <BaseCodes value={p.wageBase} onChange={(v) => up({ wageBase: v })} earnings={earnings} />
      <div className="flex items-end gap-2">
        <Num label="Wage ceiling ₹/month" value={p.wageCeiling} onChange={(v) => up({ wageCeiling: v })} />
        <label className="flex items-center gap-1 pb-1.5 text-xs">
          <input type="checkbox" checked={p.wageCeiling === null} onChange={(e) => up({ wageCeiling: e.target.checked ? null : 15000 })} />No ceiling
        </label>
      </div>
      <label className="flex items-center gap-1 pb-1.5 text-xs">
        <input type="checkbox" checked={p.contributeAboveCeiling} onChange={(e) => up({ contributeAboveCeiling: e.target.checked })} />
        Contribute on full wages above the ceiling
      </label>
    </div>
  );
}

function EsiEditor({ p, set, earnings }: { p: EsiParams; set: Setter; earnings: string[] }) {
  const up = (patch: Partial<EsiParams>) => set({ ...p, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-4">
      <Num label="Employee %" value={p.eeRate} onChange={(v) => up({ eeRate: v })} step="0.01" width="w-20" />
      <Num label="Employer %" value={p.erRate} onChange={(v) => up({ erRate: v })} step="0.01" width="w-20" />
      <BaseCodes value={p.wageBase} onChange={(v) => up({ wageBase: v })} earnings={earnings} />
      <label className="flex flex-col text-xs font-medium">
        Covered while
        <select className={`${small} font-normal`} value={p.eligibility.measure} onChange={(e) => up({ eligibility: { ...p.eligibility, measure: e.target.value as EsiParams["eligibility"]["measure"] } })}>
          <option value="fixed_gross">monthly salary (gross)</option>
          <option value="earned_gross">this month&apos;s earned gross</option>
          <option value="wage_base">the ESI wages above</option>
        </select>
      </label>
      <Num label="is at most ₹" value={p.eligibility.max} onChange={(v) => up({ eligibility: { ...p.eligibility, max: v } })} />
    </div>
  );
}

function PtEditor({ p, set }: { p: PtParams; set: Setter }) {
  const up = (patch: Partial<PtParams>) => set({ ...p, ...patch });
  const slabs = p.slabs;
  const ex = p.exemptions?.[0];
  const feb = p.monthOverrides?.[0];
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="font-medium">Slabs (monthly salary → tax)</p>
        <table className="mt-1">
          <tbody>
            {slabs.map((s, i) => (
              <tr key={i}>
                <td className="pr-2">{s.below === null ? "Everything above" : "Below ₹"}</td>
                <td className="pr-2">
                  {s.below !== null && (
                    <input type="number" min={0} className={`${small} w-28`} value={s.below}
                      onChange={(e) => up({ slabs: slabs.map((x, j) => (j === i ? { ...x, below: Number(e.target.value) } : x)) })} />
                  )}
                </td>
                <td className="pr-2">pays ₹</td>
                <td className="pr-2">
                  <input type="number" min={0} className={`${small} w-20`} value={s.amount}
                    onChange={(e) => up({ slabs: slabs.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)) })} />
                </td>
                <td>
                  {s.below !== null && (
                    <button aria-label="Remove slab" onClick={() => up({ slabs: slabs.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="mt-1 text-primary hover:underline"
          onClick={() => {
            const bounded = slabs.filter((s) => s.below !== null);
            const last = bounded.length ? bounded[bounded.length - 1].below! : 0;
            up({ slabs: [...bounded, { below: last + 5000, amount: 0 }, slabs[slabs.length - 1]] });
          }}
        >
          + Add a slab
        </button>
      </div>
      <label className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={!!ex} onChange={(e) => up({ exemptions: e.target.checked ? [{ gender: "female", below: 25001 }] : [] })} />
        Women earning below ₹
        <input type="number" min={0} disabled={!ex} className={`${small} w-28`} value={ex?.below ?? 25001}
          onChange={(e) => up({ exemptions: [{ gender: "female", below: Number(e.target.value) }] })} />
        pay nothing
      </label>
      <label className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={!!feb} onChange={(e) => up({ monthOverrides: e.target.checked ? [{ month: "02", fromAmount: 200, toAmount: 300 }] : [] })} />
        In
        <select disabled={!feb} className={small} value={feb?.month ?? "02"} onChange={(e) => up({ monthOverrides: [{ ...(feb ?? { fromAmount: 200, toAmount: 300 }), month: e.target.value }] })}>
          {MONTHS.map((m, i) => <option key={m} value={m}>{MONTH_NAMES[i]}</option>)}
        </select>
        those paying ₹
        <input type="number" min={0} disabled={!feb} className={`${small} w-20`} value={feb?.fromAmount ?? 200}
          onChange={(e) => up({ monthOverrides: [{ ...(feb ?? { month: "02", toAmount: 300 }), fromAmount: Number(e.target.value) }] })} />
        pay ₹
        <input type="number" min={0} disabled={!feb} className={`${small} w-20`} value={feb?.toAmount ?? 300}
          onChange={(e) => up({ monthOverrides: [{ ...(feb ?? { month: "02", fromAmount: 200 }), toAmount: Number(e.target.value) }] })} />
      </label>
    </div>
  );
}

function LwfEditor({ p, set }: { p: LwfParams; set: Setter }) {
  const up = (patch: Partial<LwfParams>) => set({ ...p, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-4 text-xs">
      <Num label="Employee ₹" value={p.eeAmount} onChange={(v) => up({ eeAmount: v })} width="w-20" />
      <Num label="Employer ₹" value={p.erAmount} onChange={(v) => up({ erAmount: v })} width="w-20" />
      <fieldset>
        <legend className="font-medium">Collected in</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {MONTHS.map((m, i) => (
            <label key={m} className="flex items-center gap-1">
              <input type="checkbox" checked={p.months.includes(m)} onChange={(e) => up({ months: e.target.checked ? [...p.months, m].sort() : p.months.filter((x) => x !== m) })} />
              {MONTH_NAMES[i]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function RegimeEditor({ title, r, set }: { title: string; r: TaxRegimeParams; set: (r: TaxRegimeParams) => void }) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      <table>
        <tbody>
          {r.slabs.map((s, i) => (
            <tr key={i}>
              <td className="pr-2">{s.upTo === null ? "Above that" : "Up to ₹"}</td>
              <td className="pr-2">
                {s.upTo !== null && (
                  <input type="number" min={0} className={`${small} w-28`} value={s.upTo}
                    onChange={(e) => set({ ...r, slabs: r.slabs.map((x, j) => (j === i ? { ...x, upTo: Number(e.target.value) } : x)) })} />
                )}
              </td>
              <td className="pr-1">
                <input type="number" min={0} max={100} className={`${small} w-16`} value={s.rate}
                  onChange={(e) => set({ ...r, slabs: r.slabs.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)) })} />
              </td>
              <td>%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3">
        <Num label="Standard deduction ₹" value={r.standardDeduction} onChange={(v) => set({ ...r, standardDeduction: v })} />
        <Num label="No tax up to ₹ (rebate)" value={r.rebateUpTo} onChange={(v) => set({ ...r, rebateUpTo: v })} />
      </div>
    </div>
  );
}

function TdsEditor({ p, set }: { p: TdsParams; set: Setter }) {
  if (!p) return <p className="text-xs text-muted-foreground">No standard income-tax rule is available to start from.</p>;
  return (
    <div className="grid gap-4 text-xs md:grid-cols-2">
      <RegimeEditor title="New regime" r={p.regimes.new} set={(r) => set({ ...p, regimes: { ...p.regimes, new: r } })} />
      <RegimeEditor title="Old regime" r={p.regimes.old} set={(r) => set({ ...p, regimes: { ...p.regimes, old: r } })} />
      <Num label="Cess %" value={p.cessPct} onChange={(v) => set({ ...p, cessPct: v })} width="w-20" />
    </div>
  );
}

