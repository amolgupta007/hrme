"use server";

// Settings → Payroll: the engine's per-org settings, salary components and
// statutory-rule overrides. Every write is admin-only, Business-plan gated,
// validated, versioned by pay month, and logged in payroll_audit_log.
// Plan: docs/planning/payroll/payroll-engine-plan.md (step 3).
//
// Nothing here changes a payroll number yet: runs keep using the legacy path
// until the run workflow moves onto the engine (step 5).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import {
  currentPayMonthIST,
  defaultComponents,
  isPayMonth,
  RULE_PARAM_SCHEMAS,
  SYSTEM_COMPONENT_CODES,
  validateComponents,
  type ComponentDef,
  type PayMonth,
  type StatutoryRuleKey,
} from "@jambahr/shared/payroll/engine";
import {
  diffFields,
  loadPayrollConfig,
  writePayrollAudit,
  type AuditEntry,
  type OrgPayrollSettings,
  type PayrollConfig,
  type StatutoryRuleRow,
  type VersionedComponent,
} from "@/lib/payroll/engine-config";
import type { ActionResult } from "@/types";
import type { Json } from "@/types/database.types";

const SETTINGS_PATH = "/dashboard/settings";

async function requirePayrollAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" } as const;
  if (!isAdmin(user.role)) return { error: "Only admins can change payroll settings" } as const;
  if (!hasFeature(user.plan ?? "starter", "payroll", user.customFeatures ?? null)) {
    return { error: "Payroll is available on the Business plan" } as const;
  }
  return { user } as const;
}

const month = z.string().refine(isPayMonth, "Pick a month (YYYY-MM)");
const reason = z.string().trim().max(500).optional();

// ── Read ──────────────────────────────────────────────────────────────────

export interface PayrollEngineView {
  month: PayMonth;
  config: PayrollConfig;
  settingsHistory: { effectiveFromMonth: string; inputMode: string; createdAt: string }[];
  orgRules: StatutoryRuleRow[];
  globalRules: StatutoryRuleRow[];
}

export async function getPayrollEngineView(forMonth?: string): Promise<ActionResult<PayrollEngineView>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const m = forMonth && isPayMonth(forMonth) ? forMonth : currentPayMonthIST();
  const sb = createAdminSupabase();
  try {
    const config = await loadPayrollConfig(sb, auth.user.orgId, m);
    const [{ data: hist, error: hErr }, { data: rules, error: rErr }] = await Promise.all([
      sb.from("payroll_settings").select("effective_from_month, input_mode, created_at")
        .eq("org_id", auth.user.orgId).order("effective_from_month", { ascending: false }),
      sb.from("statutory_rules").select("*").or(`scope.eq.global,org_id.eq.${auth.user.orgId}`)
        .order("effective_from_month", { ascending: false }),
    ]);
    if (hErr) return { success: false, error: hErr.message };
    if (rErr) return { success: false, error: rErr.message };
    const all = (rules ?? []) as StatutoryRuleRow[];
    return {
      success: true,
      data: {
        month: m,
        config,
        settingsHistory: ((hist ?? []) as { effective_from_month: string; input_mode: string; created_at: string }[]).map((h) => ({
          effectiveFromMonth: h.effective_from_month, inputMode: h.input_mode, createdAt: h.created_at,
        })),
        orgRules: all.filter((r) => r.scope === "org" && r.org_id === auth.user.orgId),
        globalRules: all.filter((r) => r.scope === "global"),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not load payroll settings" };
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

const SettingsSchema = z
  .object({
    effectiveFromMonth: month,
    inputMode: z.enum(["gross_first", "ctc_first"]),
    dayBasis: z.enum(["calendar_days", "fixed_days"]),
    fixedDays: z.number().int().min(1).max(31).nullable(),
    lopSource: z.enum(["off", "unpaid_leave", "negative_leave_balance"]),
    lopTreatment: z.enum(["prorate", "deduction"]),
    prorateJoinersLeavers: z.boolean(),
    lineRounding: z.enum(["none", "rupee"]),
    netRounding: z.enum(["none", "rupee"]),
    reason,
  })
  .refine((s) => s.dayBasis !== "fixed_days" || s.fixedDays !== null, "Enter the number of days");

export type PayrollSettingsInput = z.infer<typeof SettingsSchema>;

function settingsRow(s: PayrollSettingsInput) {
  return {
    input_mode: s.inputMode,
    day_basis: s.dayBasis,
    fixed_days: s.dayBasis === "fixed_days" ? s.fixedDays : null,
    lop_source: s.lopSource,
    lop_treatment: s.lopTreatment,
    prorate_joiners_leavers: s.prorateJoinersLeavers,
    line_rounding: s.lineRounding,
    net_rounding: s.netRounding,
  };
}

function settingsRowFromEffective(s: OrgPayrollSettings) {
  return {
    input_mode: s.inputMode,
    day_basis: s.dayBasis.type,
    fixed_days: s.dayBasis.type === "fixed_days" ? s.dayBasis.days : null,
    lop_source: s.lopSource,
    lop_treatment: s.lopTreatment,
    prorate_joiners_leavers: s.prorateJoinersLeavers,
    line_rounding: s.lineRounding,
    net_rounding: s.netRounding,
  };
}

function componentRow(orgId: string, monthStr: string, c: ComponentDef, createdBy: string | null) {
  return {
    org_id: orgId,
    code: c.code,
    effective_from_month: monthStr,
    label: c.label.trim(),
    kind: c.kind,
    method: c.method,
    base: c.method === "pct_of" ? c.base ?? null : null,
    pct: c.method === "pct_of" ? c.pct ?? null : null,
    amount: c.method === "fixed" ? c.amount ?? 0 : null,
    rule: c.method === "statutory" ? c.rule ?? null : null,
    prorate: c.prorate,
    taxable: c.taxable,
    enabled: c.enabled,
    show_on_payslip: c.showOnPayslip,
    display_order: c.order,
    is_system: SYSTEM_COMPONENT_CODES.has(c.code),
    created_by: createdBy,
  };
}

export async function savePayrollSettings(input: PayrollSettingsInput): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = SettingsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const s = parsed.data;
  const { orgId, employeeId } = auth.user;
  const sb = createAdminSupabase();

  let current: PayrollConfig;
  try {
    current = await loadPayrollConfig(sb, orgId, s.effectiveFromMonth);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not load payroll settings" };
  }

  // First save: pin today's component set so nothing changes underneath the org.
  // CTC-first keeps the exact legacy components; gross-first starts from the
  // default gross-first set (legacy's "% of CTC" Basic can't work there).
  const firstSave = current.source === "legacy";
  let seedComponents: ComponentDef[] | null = null;
  if (firstSave) {
    seedComponents =
      s.inputMode === "ctc_first"
        ? current.components // legacy set, with the org's own ratios
        : defaultComponents("gross_first");
  } else {
    const problems = validateComponents(current.components, s.inputMode);
    if (problems.length > 0) {
      return {
        success: false,
        error: `Update the salary components for this way of entering salaries first: ${problems.join("; ")}`,
      };
    }
  }

  const before = settingsRowFromEffective(current.settings);
  const after = settingsRow(s);
  const { data: saved, error } = await sb
    .from("payroll_settings")
    .upsert(
      { org_id: orgId, effective_from_month: s.effectiveFromMonth, ...after, created_by: employeeId ?? null },
      { onConflict: "org_id,effective_from_month" },
    )
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  const audit: AuditEntry[] = diffFields(firstSave ? null : before, after).map((d) => ({
    entity: "settings", entityId: (saved as { id: string }).id, action: firstSave ? "create" : "update",
    field: `${s.effectiveFromMonth}.${d.field}`, oldValue: d.oldValue, newValue: d.newValue, reason: s.reason ?? null,
  }));

  if (seedComponents) {
    const rows = seedComponents.map((c) => componentRow(orgId, s.effectiveFromMonth, c, employeeId ?? null));
    const { error: cErr } = await sb.from("payroll_components").upsert(rows, { onConflict: "org_id,code,effective_from_month" });
    if (cErr) return { success: false, error: `Settings saved, but the starting components could not be: ${cErr.message}` };
    audit.push({
      entity: "component", action: "create", field: `${s.effectiveFromMonth}.*`,
      newValue: seedComponents.map((c) => c.code), reason: "Starting component set",
    });
  }

  const auditErr = await writePayrollAudit(sb, orgId, employeeId ?? null, audit);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath(SETTINGS_PATH);
  return { success: true, data: undefined };
}

// ── Components ────────────────────────────────────────────────────────────

const ComponentSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,31}$/, "Codes are capital letters, digits and _ (e.g. FOOD_ALLOWANCE)"),
  label: z.string().trim().min(1, "Every component needs a name").max(60),
  kind: z.enum(["earning", "deduction", "employer_contribution"]),
  method: z.enum(["fixed", "pct_of", "balancing", "statutory", "manual"]),
  base: z.string().optional(),
  pct: z.number().min(0).max(100).optional(),
  amount: z.number().min(0).max(10_000_000).optional(),
  rule: z.enum(["epf", "esi", "pt", "lwf", "tds"]).optional(),
  prorate: z.boolean(),
  taxable: z.boolean(),
  enabled: z.boolean(),
  showOnPayslip: z.boolean(),
  order: z.number().int().min(0).max(100_000),
});

const ComponentsSchema = z.object({
  effectiveFromMonth: month,
  components: z.array(ComponentSchema).min(1).max(60),
  reason,
});

export type PayrollComponentsInput = z.infer<typeof ComponentsSchema>;

const comparable = (c: ComponentDef) => ({
  label: c.label, kind: c.kind, method: c.method,
  base: c.method === "pct_of" ? c.base ?? null : null,
  pct: c.method === "pct_of" ? c.pct ?? null : null,
  amount: c.method === "fixed" ? c.amount ?? 0 : null,
  rule: c.method === "statutory" ? c.rule ?? null : null,
  prorate: c.prorate, taxable: c.taxable, enabled: c.enabled, showOnPayslip: c.showOnPayslip, order: c.order,
});

export async function savePayrollComponents(input: PayrollComponentsInput): Promise<ActionResult<{ changed: number }>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = ComponentsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const { effectiveFromMonth, components, reason: why } = parsed.data;
  const { orgId, employeeId } = auth.user;
  const sb = createAdminSupabase();

  let current: PayrollConfig;
  try {
    current = await loadPayrollConfig(sb, orgId, effectiveFromMonth);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not load payroll settings" };
  }

  // Components are switched off, never removed — past months still reference them.
  const incoming = new Set(components.map((c) => c.code));
  const dropped = current.components.filter((c) => !incoming.has(c.code));
  if (dropped.length > 0) {
    return { success: false, error: `Switch components off instead of removing them: ${dropped.map((c) => c.label).join(", ")}` };
  }

  const problems = validateComponents(components as ComponentDef[], current.settings.inputMode);
  if (problems.length > 0) return { success: false, error: problems.join("; ") };

  const byCode = new Map<string, VersionedComponent>(current.components.map((c) => [c.code, c]));
  const changed = (components as ComponentDef[]).filter((c) => {
    const prev = byCode.get(c.code);
    return !prev || JSON.stringify(comparable(prev)) !== JSON.stringify(comparable(c));
  });
  if (changed.length === 0) return { success: true, data: { changed: 0 } };

  // Saving components before settings: pin the effective settings for this month too.
  if (current.source === "legacy") {
    const s = current.settings;
    const { error: sErr } = await sb.from("payroll_settings").upsert(
      { org_id: orgId, effective_from_month: effectiveFromMonth, ...settingsRowFromEffective(s), created_by: employeeId ?? null },
      { onConflict: "org_id,effective_from_month" },
    );
    if (sErr) return { success: false, error: sErr.message };
  }

  // A new version for a month carries the whole set, so later months see one coherent list.
  const rows = (components as ComponentDef[]).map((c) => componentRow(orgId, effectiveFromMonth, c, employeeId ?? null));
  const { error } = await sb.from("payroll_components").upsert(rows, { onConflict: "org_id,code,effective_from_month" });
  if (error) return { success: false, error: error.message };

  const audit: AuditEntry[] = [];
  for (const c of changed) {
    const prev = byCode.get(c.code);
    if (!prev) {
      audit.push({ entity: "component", action: "create", field: `${effectiveFromMonth}.${c.code}`, newValue: comparable(c), reason: why ?? null });
      continue;
    }
    for (const d of diffFields(comparable(prev), comparable(c))) {
      audit.push({
        entity: "component", action: "update", field: `${effectiveFromMonth}.${c.code}.${d.field}`,
        oldValue: d.oldValue, newValue: d.newValue, reason: why ?? null,
      });
    }
  }
  const auditErr = await writePayrollAudit(sb, orgId, employeeId ?? null, audit);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath(SETTINGS_PATH);
  return { success: true, data: { changed: changed.length } };
}

// ── Statutory rule overrides ──────────────────────────────────────────────

const RuleSchema = z.object({
  ruleKey: z.enum(["epf", "esi", "pt", "lwf", "tds"]),
  jurisdiction: z.string().trim().toLowerCase().max(60).nullable(),
  effectiveFromMonth: month,
  params: z.unknown(),
  label: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  reason,
});

export type OrgRuleInput = z.infer<typeof RuleSchema>;

export async function saveOrgRule(input: OrgRuleInput): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const parsed = RuleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const r = parsed.data;
  const key = r.ruleKey as StatutoryRuleKey;
  const jurisdiction = key === "pt" || key === "lwf" ? r.jurisdiction || null : null;
  const params = RULE_PARAM_SCHEMAS[key].safeParse(r.params);
  if (!params.success) {
    const issue = params.error.errors[0];
    return { success: false, error: `${issue.path.join(".") || "Rule"}: ${issue.message}` };
  }
  const { orgId, employeeId } = auth.user;
  const sb = createAdminSupabase();

  let q = sb.from("statutory_rules").select("id, params").eq("org_id", orgId).eq("rule_key", key)
    .eq("effective_from_month", r.effectiveFromMonth);
  q = jurisdiction === null ? q.is("jurisdiction", null) : q.eq("jurisdiction", jurisdiction);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) return { success: false, error: findErr.message };

  const row = {
    scope: "org", org_id: orgId, rule_key: key, jurisdiction, effective_from_month: r.effectiveFromMonth,
    params: params.data as unknown as Json, label: r.label || null, notes: r.notes || null, created_by: employeeId ?? null,
  };
  const prev = existing as { id: string; params: unknown } | null;
  const res = prev
    ? await sb.from("statutory_rules").update(row).eq("id", prev.id).select("id").single()
    : await sb.from("statutory_rules").insert(row).select("id").single();
  if (res.error) return { success: false, error: res.error.message };
  const id = (res.data as { id: string }).id;

  const auditErr = await writePayrollAudit(sb, orgId, employeeId ?? null, [{
    entity: "rule", entityId: id, action: prev ? "update" : "create",
    field: `${key}${jurisdiction ? `:${jurisdiction}` : ""}@${r.effectiveFromMonth}`,
    oldValue: prev?.params ?? null, newValue: params.data, reason: r.reason ?? null,
  }]);
  if (auditErr) return { success: false, error: `Saved, but the change could not be logged: ${auditErr}` };
  revalidatePath(SETTINGS_PATH);
  return { success: true, data: { id } };
}

export async function deleteOrgRule(input: { id: string; reason?: string }): Promise<ActionResult<void>> {
  const auth = await requirePayrollAdmin();
  if ("error" in auth) return { success: false, error: auth.error! };
  const id = z.string().uuid().safeParse(input.id);
  if (!id.success) return { success: false, error: "Unknown rule" };
  const { orgId, employeeId } = auth.user;
  const sb = createAdminSupabase();
  const { data: rule, error: findErr } = await sb.from("statutory_rules").select("*")
    .eq("id", id.data).eq("org_id", orgId).eq("scope", "org").maybeSingle();
  if (findErr) return { success: false, error: findErr.message };
  if (!rule) return { success: false, error: "Only your organisation's own rules can be removed" };
  const r = rule as StatutoryRuleRow;

  const { error } = await sb.from("statutory_rules").delete().eq("id", r.id).eq("org_id", orgId);
  if (error) return { success: false, error: error.message };
  const auditErr = await writePayrollAudit(sb, orgId, employeeId ?? null, [{
    entity: "rule", entityId: r.id, action: "delete",
    field: `${r.rule_key}${r.jurisdiction ? `:${r.jurisdiction}` : ""}@${r.effective_from_month}`,
    oldValue: r.params, reason: input.reason?.trim() || null,
  }]);
  if (auditErr) return { success: false, error: `Removed, but the change could not be logged: ${auditErr}` };
  revalidatePath(SETTINGS_PATH);
  return { success: true, data: undefined };
}
