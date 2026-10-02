// Loading and saving the payroll engine's configuration (settings, components,
// statutory rules) and writing the payroll audit log. Plain module — NOT
// "use server" (gotcha #85): these take a raw org id and must never be
// browser-callable. Callers (server actions) do auth + role + plan checks.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RATIO_CONFIG,
  type RatioConfig,
} from "@jambahr/shared/payroll/ctc";
import {
  effectiveComponents,
  legacyComponents,
  legacySettings,
  pickEffective,
  type ComponentDef,
  type PayMonth,
  type PayrollSettings,
  type StatutoryRule,
  type StatutoryRuleKey,
} from "@jambahr/shared/payroll/engine";

// ── Row shapes (the generated types don't know migrations 114–120 yet) ───────

export interface PayrollSettingsRow {
  id: string;
  org_id: string;
  effective_from_month: string;
  input_mode: "gross_first" | "ctc_first";
  day_basis: "calendar_days" | "fixed_days";
  fixed_days: number | null;
  lop_source: "off" | "unpaid_leave" | "negative_leave_balance";
  lop_treatment: "prorate" | "deduction";
  prorate_joiners_leavers: boolean;
  line_rounding: "none" | "rupee";
  net_rounding: "none" | "rupee";
  payslip: Record<string, unknown>;
  created_at: string;
}

export interface PayrollComponentRow {
  id: string;
  org_id: string;
  code: string;
  effective_from_month: string;
  label: string;
  kind: ComponentDef["kind"];
  method: ComponentDef["method"];
  base: string | null;
  pct: number | string | null;
  amount: number | string | null;
  rule: StatutoryRuleKey | null;
  prorate: boolean;
  taxable: boolean;
  enabled: boolean;
  show_on_payslip: boolean;
  display_order: number;
  is_system: boolean;
}

export interface StatutoryRuleRow {
  id: string;
  scope: "global" | "org";
  org_id: string | null;
  rule_key: StatutoryRuleKey;
  jurisdiction: string | null;
  effective_from_month: string;
  params: unknown;
  label: string | null;
  notes: string | null;
  created_at: string;
}

/** Settings as the UI and engine see them, plus the LOP source (a run-input concern). */
export type OrgPayrollSettings = PayrollSettings & {
  lopSource: PayrollSettingsRow["lop_source"];
  effectiveFromMonth: PayMonth;
};

export type VersionedComponent = ComponentDef & { effectiveFromMonth: PayMonth; isSystem: boolean };

const n = (v: number | string | null): number | undefined => (v === null || v === undefined ? undefined : Number(v));

export function settingsFromRow(r: PayrollSettingsRow): OrgPayrollSettings {
  return {
    inputMode: r.input_mode,
    dayBasis: r.day_basis === "fixed_days" ? { type: "fixed_days", days: r.fixed_days ?? 26 } : { type: "calendar_days" },
    lopTreatment: r.lop_treatment,
    prorateJoinersLeavers: r.prorate_joiners_leavers,
    lineRounding: r.line_rounding,
    netRounding: r.net_rounding,
    lopSource: r.lop_source,
    effectiveFromMonth: r.effective_from_month,
  };
}

export function componentFromRow(r: PayrollComponentRow): VersionedComponent {
  return {
    code: r.code,
    label: r.label,
    kind: r.kind,
    method: r.method,
    base: r.base ?? undefined,
    pct: n(r.pct),
    amount: n(r.amount),
    rule: r.rule ?? undefined,
    prorate: r.prorate,
    taxable: r.taxable,
    enabled: r.enabled,
    showOnPayslip: r.show_on_payslip,
    order: r.display_order,
    effectiveFromMonth: r.effective_from_month,
    isSystem: r.is_system,
  };
}

export function ruleFromRow(r: StatutoryRuleRow): StatutoryRule {
  return {
    id: r.id,
    scope: r.scope,
    ruleKey: r.rule_key,
    jurisdiction: r.jurisdiction,
    effectiveFromMonth: r.effective_from_month,
    params: r.params as StatutoryRule["params"],
  };
}

// ── Loading ────────────────────────────────────────────────────────────────

export interface PayrollConfig {
  /** `saved` = the org has configured the engine; `legacy` = defaults that reproduce today's payroll. */
  source: "saved" | "legacy";
  settings: OrgPayrollSettings;
  components: VersionedComponent[];
  /** Global defaults + this org's overrides (all versions — the engine picks by month). */
  rules: StatutoryRule[];
}

async function legacyRatios(sb: SupabaseClient, orgId: string): Promise<RatioConfig> {
  const { data } = await sb
    .from("salary_structure_config")
    .select("basic_pct, hra_pct_metro, hra_pct_non_metro, gratuity_pct")
    .eq("org_id", orgId)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return DEFAULT_RATIO_CONFIG;
  const d = data as Record<string, number | string>;
  return {
    basic_pct: Number(d.basic_pct),
    hra_pct_metro: Number(d.hra_pct_metro),
    hra_pct_non_metro: Number(d.hra_pct_non_metro),
    gratuity_pct: Number(d.gratuity_pct),
  };
}

/** Everything that governs `month` for this org. Throws on a failed read (never silently falls back). */
export async function loadPayrollConfig(sb: SupabaseClient, orgId: string, month: PayMonth): Promise<PayrollConfig> {
  const [settingsRes, componentsRes, rules] = await Promise.all([
    sb.from("payroll_settings").select("*").eq("org_id", orgId),
    sb.from("payroll_components").select("*").eq("org_id", orgId),
    loadRules(sb, orgId),
  ]);
  if (settingsRes.error) throw new Error(`payroll_settings: ${settingsRes.error.message}`);
  if (componentsRes.error) throw new Error(`payroll_components: ${componentsRes.error.message}`);

  const settingsRows = (settingsRes.data ?? []) as PayrollSettingsRow[];
  const componentRows = (componentsRes.data ?? []) as PayrollComponentRow[];
  const s = pickEffective(settingsRows.map(settingsFromRow), month);
  const comps = effectiveComponents(componentRows.map(componentFromRow), month);

  if (s && comps.length > 0) return { source: "saved", settings: s, components: comps, rules };

  // Not configured (or not yet for this month): today's behaviour, exactly.
  const ratios = await legacyRatios(sb, orgId);
  return {
    source: "legacy",
    settings: s ?? { ...legacySettings(), lopSource: "unpaid_leave", effectiveFromMonth: month },
    components:
      comps.length > 0
        ? comps
        : legacyComponents(ratios).map((c) => ({ ...c, effectiveFromMonth: month, isSystem: true })),
    rules,
  };
}

export async function loadRules(sb: SupabaseClient, orgId: string): Promise<StatutoryRule[]> {
  const { data, error } = await sb
    .from("statutory_rules")
    .select("*")
    .or(`scope.eq.global,org_id.eq.${orgId}`);
  if (error) throw new Error(`statutory_rules: ${error.message}`);
  return ((data ?? []) as StatutoryRuleRow[])
    .filter((r) => r.scope === "global" || r.org_id === orgId)
    .map(ruleFromRow);
}

// ── Audit ──────────────────────────────────────────────────────────────────

export type AuditEntity =
  | "settings" | "component" | "rule" | "salary_revision" | "salary_component_value"
  | "run" | "entry" | "line_item" | "employee_payroll_exclusion";

export interface AuditEntry {
  entity: AuditEntity;
  entityId?: string | null;
  action: "create" | "update" | "delete" | "transition";
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}

/**
 * Appends to payroll_audit_log. Unlike the JambaHire audit (gotcha #52) this
 * is NOT best-effort: payroll changes must be traceable, so a failed audit
 * write is returned to the caller as an error.
 */
export async function writePayrollAudit(
  sb: SupabaseClient,
  orgId: string,
  actorEmployeeId: string | null,
  entries: AuditEntry[],
): Promise<string | null> {
  if (entries.length === 0) return null;
  const { error } = await sb.from("payroll_audit_log").insert(
    entries.map((e) => ({
      org_id: orgId,
      entity: e.entity,
      entity_id: e.entityId ?? null,
      action: e.action,
      field: e.field ?? null,
      old_value: e.oldValue === undefined ? null : e.oldValue,
      new_value: e.newValue === undefined ? null : e.newValue,
      actor_employee_id: actorEmployeeId,
      reason: e.reason ?? null,
    })),
  );
  return error ? error.message : null;
}

/** Field-level differences between two flat objects, for the audit log. */
export function diffFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): { field: string; oldValue: unknown; newValue: unknown }[] {
  const out: { field: string; oldValue: unknown; newValue: unknown }[] = [];
  for (const [k, v] of Object.entries(after)) {
    const old = before ? before[k] : undefined;
    if (JSON.stringify(old ?? null) !== JSON.stringify(v ?? null)) out.push({ field: k, oldValue: old ?? null, newValue: v ?? null });
  }
  return out;
}
