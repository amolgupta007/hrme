"use server";

// Server actions for the Offer Letter & Document Templating System (Phase 1).
// Tenant isolation is app-layer: service-role client + resolveDocScope filters +
// isAdmin gating (RLS is advisory — CLAUDE.md gotcha #5). Public token actions
// (ack/decline) intentionally skip auth and validate by token + status only.
import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";
import { resolveDocScope, applyScopeFilter } from "@/lib/documents/scope";
import {
  resolveVariablesForEmployee,
  applyVariables,
  unknownPlaceholders,
} from "@/lib/documents/variables";
import { generateClauses } from "@/lib/documents/generate-clauses";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import {
  draftPdfPath,
  uploadDraftPdf,
  getSignedDocUrl,
} from "@/lib/documents/storage";
import { documentTitleFor } from "@/lib/documents/title";
import { getSignatureProvider } from "@/lib/documents/signature";
import { ACKNOWLEDGEMENT_STATEMENT } from "@/lib/documents/acknowledgement";
import type {
  Clause,
  ClauseCategory,
  DocumentType,
  RenderedClause,
  TemplateStatus,
  ClauseGenInput,
} from "@/lib/documents/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://jambahr.com";
const ACK_EXPIRY_DAYS = 30;

type Sb = ReturnType<typeof createAdminSupabase>;

async function requireAdminCtx() {
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" as const };
  if (!isAdmin(user.role)) return { error: "Unauthorized" as const };
  return { user, sb: createAdminSupabase() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────
export interface TemplateSummary {
  id: string;
  name: string;
  type: DocumentType;
  status: TemplateStatus;
  clause_count: number;
  updated_at: string;
}

export async function listTemplates(): Promise<ActionResult<TemplateSummary[]>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const q = applyScopeFilter(
    sb.from("document_templates").select("id, name, type, status, updated_at") as any,
    scope
  ).order("updated_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const templates = (data ?? []) as any[];
  const ids = templates.map((t) => t.id);
  const counts: Record<string, number> = {};
  if (ids.length) {
    const { data: clauses } = await sb
      .from("document_clauses")
      .select("template_id")
      .in("template_id", ids);
    for (const c of (clauses ?? []) as any[]) {
      counts[c.template_id] = (counts[c.template_id] ?? 0) + 1;
    }
  }

  return {
    success: true,
    data: templates.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      status: t.status,
      clause_count: counts[t.id] ?? 0,
      updated_at: t.updated_at,
    })),
  };
}

export interface TemplateDetail {
  id: string;
  name: string;
  type: DocumentType;
  status: TemplateStatus;
  clauses: Clause[];
}

export async function getTemplate(id: string): Promise<ActionResult<TemplateDetail>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const { data: t } = await sb
    .from("document_templates")
    .select("id, name, type, status, org_id, group_id")
    .eq("id", id)
    .maybeSingle();
  if (!t) return { success: false, error: "Template not found" };
  const tpl = t as any;
  if (!inScope(tpl, scope)) return { success: false, error: "Template not found" };

  const { data: clauses } = await sb
    .from("document_clauses")
    .select("id, title, body_markdown, is_mandatory, category, order_index")
    .eq("template_id", id)
    .order("order_index", { ascending: true });

  return {
    success: true,
    data: {
      id: tpl.id,
      name: tpl.name,
      type: tpl.type,
      status: tpl.status,
      clauses: (clauses ?? []) as Clause[],
    },
  };
}

function inScope(row: { org_id: string; group_id: string | null }, scope: { groupId: string | null; orgId: string }) {
  return scope.groupId ? row.group_id === scope.groupId : row.org_id === scope.orgId && !row.group_id;
}

interface TemplateInput {
  name: string;
  type: DocumentType;
  clauses: Array<{
    title: string;
    body_markdown: string;
    is_mandatory: boolean;
    category: ClauseCategory;
  }>;
}

export async function createTemplate(input: TemplateInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  if (!input.name?.trim()) return { success: false, error: "Template name is required" };
  const scope = await resolveDocScope(sb, user.orgId);

  const { data, error } = await sb
    .from("document_templates")
    .insert({
      org_id: user.orgId,
      group_id: scope.groupId,
      name: input.name.trim(),
      type: input.type,
      status: "draft",
      created_by: user.employeeId,
    } as any)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  const templateId = (data as any).id as string;

  const clauseErr = await replaceClauses(sb, templateId, input.clauses);
  if (clauseErr) return { success: false, error: clauseErr };

  revalidatePath("/dashboard/documents/templates");
  return { success: true, data: { id: templateId } };
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const { data: t } = await sb.from("document_templates").select("org_id, group_id").eq("id", id).maybeSingle();
  if (!t || !inScope(t as any, scope)) return { success: false, error: "Template not found" };

  const { error } = await sb
    .from("document_templates")
    .update({ name: input.name.trim(), type: input.type, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) return { success: false, error: error.message };

  const clauseErr = await replaceClauses(sb, id, input.clauses);
  if (clauseErr) return { success: false, error: clauseErr };

  revalidatePath("/dashboard/documents/templates");
  revalidatePath(`/dashboard/documents/templates/${id}`);
  return { success: true, data: undefined };
}

async function replaceClauses(sb: Sb, templateId: string, clauses: TemplateInput["clauses"]): Promise<string | null> {
  await sb.from("document_clauses").delete().eq("template_id", templateId);
  if (!clauses.length) return null;
  const rows = clauses.map((c, i) => ({
    template_id: templateId,
    order_index: i,
    title: c.title,
    body_markdown: c.body_markdown,
    is_mandatory: c.is_mandatory,
    category: c.category,
  }));
  const { error } = await sb.from("document_clauses").insert(rows as any);
  return error ? error.message : null;
}

export async function setTemplateStatus(id: string, status: TemplateStatus): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const { data: t } = await sb.from("document_templates").select("org_id, group_id").eq("id", id).maybeSingle();
  if (!t || !inScope(t as any, scope)) return { success: false, error: "Template not found" };

  // Activation gate: validate placeholders against the declared registry.
  if (status === "active") {
    const { data: clauses } = await sb.from("document_clauses").select("body_markdown, title").eq("template_id", id);
    const bodies = ((clauses ?? []) as any[]).map((c) => `${c.title}\n${c.body_markdown}`);
    if (!bodies.length) return { success: false, error: "Add at least one clause before activating" };
    const declared = await declaredVariableKeys(sb);
    const unknown = unknownPlaceholders(bodies, declared);
    if (unknown.length) {
      return { success: false, error: `Unknown placeholders: ${unknown.map((u) => `{{${u}}}`).join(", ")}` };
    }
  }

  const { error } = await sb
    .from("document_templates")
    .update({ status, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/documents/templates");
  return { success: true, data: undefined };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  const { data: t } = await sb.from("document_templates").select("org_id, group_id").eq("id", id).maybeSingle();
  if (!t || !inScope(t as any, scope)) return { success: false, error: "Template not found" };
  const { error } = await sb.from("document_templates").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/documents/templates");
  return { success: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clause library + variables
// ─────────────────────────────────────────────────────────────────────────────
export interface LibraryClause {
  id: string;
  title: string;
  body_markdown: string;
  category: ClauseCategory;
  is_system_default: boolean;
}

export async function listClauseLibrary(): Promise<ActionResult<LibraryClause[]>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  // system defaults ∪ caller scope
  const { data: sys } = await sb
    .from("clause_library")
    .select("id, title, body_markdown, category, is_system_default")
    .eq("is_system_default", true);
  const own = applyScopeFilter(
    sb.from("clause_library").select("id, title, body_markdown, category, is_system_default").eq("is_system_default", false) as any,
    scope
  );
  const { data: mine } = await own;

  const merged = [...((sys ?? []) as any[]), ...((mine ?? []) as any[])];
  return { success: true, data: merged as LibraryClause[] };
}

export async function createClauseLibraryItem(input: {
  title: string;
  body_markdown: string;
  category: ClauseCategory;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  if (!input.title?.trim()) return { success: false, error: "Title is required" };
  const scope = await resolveDocScope(sb, user.orgId);
  const { data, error } = await sb
    .from("clause_library")
    .insert({
      org_id: user.orgId,
      group_id: scope.groupId,
      title: input.title.trim(),
      body_markdown: input.body_markdown,
      category: input.category,
      is_system_default: false,
    } as any)
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, data: { id: (data as any).id } };
}

export async function deleteClauseLibraryItem(id: string): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  const { data: c } = await sb.from("clause_library").select("org_id, group_id, is_system_default").eq("id", id).maybeSingle();
  if (!c) return { success: false, error: "Clause not found" };
  if ((c as any).is_system_default) return { success: false, error: "System default clauses cannot be deleted" };
  if (!inScope(c as any, scope)) return { success: false, error: "Clause not found" };
  const { error } = await sb.from("clause_library").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: undefined };
}

async function declaredVariableKeys(sb: Sb): Promise<string[]> {
  const { data } = await sb.from("document_variables").select("key");
  return ((data ?? []) as any[]).map((r) => r.key);
}

export async function listDocumentVariables(): Promise<ActionResult<{ key: string; label: string }[]>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { data } = await ctx.sb.from("document_variables").select("key, label").order("key");
  return { success: true, data: (data ?? []) as any[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI first draft
// ─────────────────────────────────────────────────────────────────────────────
export async function generateTemplateDraft(
  input: Omit<ClauseGenInput, "groupName">
): Promise<ActionResult<{ clauses: TemplateInput["clauses"] }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "AI generation is not configured (ANTHROPIC_API_KEY missing)" };
  }
  try {
    const result = await generateClauses({ ...input, groupName: ctx.user.orgName });
    return {
      success: true,
      data: {
        clauses: result.clauses.map((c) => ({
          title: c.title,
          body_markdown: c.body_markdown,
          is_mandatory: c.is_mandatory,
          category: c.category,
        })),
      },
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Generation failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Issuance
// ─────────────────────────────────────────────────────────────────────────────
export interface IssuanceContext {
  templates: { id: string; name: string; type: DocumentType }[];
  issuingEntities: { id: string; name: string }[];
  employees: { id: string; name: string; designation: string | null; email: string | null }[];
}

export async function getIssuanceContext(): Promise<ActionResult<IssuanceContext>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const templatesQ = applyScopeFilter(
    sb.from("document_templates").select("id, name, type, org_id, group_id").eq("status", "active") as any,
    scope
  ).order("name");
  const { data: templates } = await templatesQ;

  const { data: entities } = await sb
    .from("organizations")
    .select("id, name")
    .in("id", scope.issuingEntityIds);

  const { data: emps } = await sb
    .from("employees")
    .select("id, first_name, last_name, designation, email")
    .eq("org_id", user.orgId)
    .neq("status", "terminated")
    .order("first_name");

  return {
    success: true,
    data: {
      templates: ((templates ?? []) as any[]).map((t) => ({ id: t.id, name: t.name, type: t.type })),
      issuingEntities: ((entities ?? []) as any[]).map((e) => ({ id: e.id, name: e.name })),
      employees: ((emps ?? []) as any[]).map((e) => ({
        id: e.id,
        name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
        designation: e.designation,
        email: e.email,
      })),
    },
  };
}

async function loadTemplateClauses(sb: Sb, templateId: string): Promise<Clause[]> {
  const { data } = await sb
    .from("document_clauses")
    .select("title, body_markdown, is_mandatory, category, order_index")
    .eq("template_id", templateId)
    .order("order_index", { ascending: true });
  return (data ?? []) as Clause[];
}

function renderClauses(clauses: Clause[], values: Record<string, string>): RenderedClause[] {
  return clauses.map((c) => ({
    title: c.title,
    body_markdown: applyVariables(c.body_markdown, values),
    category: c.category,
  }));
}

export interface IssuancePreviewRow {
  employee_id: string;
  employee_name: string;
  values: Record<string, string>;
  clauses: RenderedClause[];
}

/** Non-persisting preview: resolve variables + render clause text per employee. */
export async function previewIssuance(input: {
  templateId: string;
  employeeIds: string[];
  issuingEntityId: string;
  overrides?: Record<string, Record<string, string>>;
}): Promise<ActionResult<IssuancePreviewRow[]>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  if (!scope.issuingEntityIds.includes(input.issuingEntityId)) {
    return { success: false, error: "Invalid issuing entity" };
  }
  const clauses = await loadTemplateClauses(sb, input.templateId);
  if (!clauses.length) return { success: false, error: "Template has no clauses" };

  const rows: IssuancePreviewRow[] = [];
  for (const employeeId of input.employeeIds) {
    const base = await resolveVariablesForEmployee(sb, {
      employeeId,
      issuingEntityId: input.issuingEntityId,
      groupId: scope.groupId,
    });
    const values = { ...base, ...(input.overrides?.[employeeId] ?? {}) };
    rows.push({
      employee_id: employeeId,
      employee_name: values.employee_name || "",
      values,
      clauses: renderClauses(clauses, values),
    });
  }
  return { success: true, data: rows };
}

/** Persist draft issued documents + render/store the draft PDF for each. Does NOT send. */
export async function issueDocuments(input: {
  templateId: string;
  employeeIds: string[];
  issuingEntityId: string;
  overrides?: Record<string, Record<string, string>>;
}): Promise<ActionResult<{ ids: string[] }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  if (!scope.issuingEntityIds.includes(input.issuingEntityId)) {
    return { success: false, error: "Invalid issuing entity" };
  }
  if (!input.employeeIds.length) return { success: false, error: "Select at least one employee" };

  const { data: tplRow } = await sb
    .from("document_templates")
    .select("id, name, type, org_id, group_id, status")
    .eq("id", input.templateId)
    .maybeSingle();
  if (!tplRow || !inScope(tplRow as any, scope)) return { success: false, error: "Template not found" };
  if ((tplRow as any).status !== "active") return { success: false, error: "Template must be active to issue" };
  const clauses = await loadTemplateClauses(sb, input.templateId);
  if (!clauses.length) return { success: false, error: "Template has no clauses" };

  const { data: entity } = await sb.from("organizations").select("name").eq("id", input.issuingEntityId).maybeSingle();
  const entityName = (entity as any)?.name ?? "";
  const docTitle = documentTitleFor((tplRow as any).type, (tplRow as any).name);

  const ids: string[] = [];
  for (const employeeId of input.employeeIds) {
    const base = await resolveVariablesForEmployee(sb, {
      employeeId,
      issuingEntityId: input.issuingEntityId,
      groupId: scope.groupId,
    });
    const values = { ...base, ...(input.overrides?.[employeeId] ?? {}) };
    const rendered = renderClauses(clauses, values);

    const { data: inserted, error } = await sb
      .from("issued_documents")
      .insert({
        template_id: input.templateId,
        employee_id: employeeId,
        issuing_entity_id: input.issuingEntityId,
        org_id: user.orgId,
        group_id: scope.groupId,
        resolved_values: values,
        rendered_body: rendered,
        status: "draft",
        created_by: user.employeeId,
      } as any)
      .select("id")
      .single();
    if (error || !inserted) return { success: false, error: error?.message ?? "Insert failed" };
    const issuedId = (inserted as any).id as string;

    const pdf = await renderDocumentPdf({
      documentTitle: docTitle,
      issuingEntityName: entityName,
      issuingEntityAddress: values.issuing_entity_address,
      clauses: rendered,
    });
    const path = draftPdfPath(user.orgId, issuedId);
    const up = await uploadDraftPdf(sb, path, pdf);
    if (up.ok) {
      await sb.from("issued_documents").update({ draft_pdf_url: path } as any).eq("id", issuedId);
    }
    ids.push(issuedId);
  }

  revalidatePath("/dashboard/documents/issued");
  return { success: true, data: { ids } };
}

/** Send previously-issued draft documents: mint token, email the employee, mark sent. */
export async function sendIssuedDocuments(ids: string[]): Promise<ActionResult<{ sent: number }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  if (!ids.length) return { success: false, error: "Nothing to send" };

  const { data: docs } = await sb
    .from("issued_documents")
    .select("id, org_id, group_id, employee_id, issuing_entity_id, template_id, resolved_values, status")
    .in("id", ids);

  let sent = 0;
  for (const raw of (docs ?? []) as any[]) {
    if (!inScope(raw, scope)) continue;
    if (raw.status !== "draft") continue;

    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + ACK_EXPIRY_DAYS * 86400_000).toISOString();
    const { error } = await sb
      .from("issued_documents")
      .update({ ack_token: token, ack_token_expires_at: expires, status: "sent", sent_at: new Date().toISOString() } as any)
      .eq("id", raw.id);
    if (error) continue;

    await sendDocumentIssuedEmail(sb, raw, token).catch(() => {});
    sent++;
  }

  revalidatePath("/dashboard/documents/issued");
  return { success: true, data: { sent } };
}

async function sendDocumentIssuedEmail(sb: Sb, doc: any, token: string) {
  const values = (doc.resolved_values ?? {}) as Record<string, string>;
  const to = values.employee_email;
  if (!to) return;
  const [{ data: tpl }, { data: entity }] = await Promise.all([
    sb.from("document_templates").select("type, name").eq("id", doc.template_id).maybeSingle(),
    sb.from("organizations").select("name").eq("id", doc.issuing_entity_id).maybeSingle(),
  ]);
  const { resend, FROM_EMAIL } = await import("@/lib/resend");
  const { render } = await import("@react-email/render");
  const { DocumentIssuedEmail } = await import("@/components/emails/document-issued");
  const html = await render(
    DocumentIssuedEmail({
      employeeName: values.employee_name || "there",
      entityName: (entity as any)?.name ?? "",
      documentTitle: documentTitleFor((tpl as any)?.type ?? "offer_letter", (tpl as any)?.name),
      ackUrl: `${APP_URL}/documents/ack/${token}`,
    })
  );
  await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your ${documentTitleFor((tpl as any)?.type ?? "offer_letter", (tpl as any)?.name)} from ${(entity as any)?.name ?? "your employer"}`,
    html,
  });
}

// Convenience: issue + send in one call (used by the wizard's "Send" button).
export async function issueAndSend(input: {
  templateId: string;
  employeeIds: string[];
  issuingEntityId: string;
  overrides?: Record<string, Record<string, string>>;
}): Promise<ActionResult<{ sent: number }>> {
  const issued = await issueDocuments(input);
  if (!issued.success) return issued;
  return sendIssuedDocuments(issued.data.ids);
}

// ─────────────────────────────────────────────────────────────────────────────
// Issued documents list (admin) + draft preview URL
// ─────────────────────────────────────────────────────────────────────────────
export interface IssuedRow {
  id: string;
  employee_name: string;
  entity_name: string;
  template_name: string;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export async function listIssuedDocuments(): Promise<ActionResult<IssuedRow[]>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const q = applyScopeFilter(
    sb
      .from("issued_documents")
      .select("id, status, sent_at, created_at, resolved_values, issuing_entity_id, template_id, org_id, group_id") as any,
    scope
  ).order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as any[];
  const entityIds = [...new Set(rows.map((r) => r.issuing_entity_id))];
  const tplIds = [...new Set(rows.map((r) => r.template_id))];
  const [{ data: ents }, { data: tpls }] = await Promise.all([
    entityIds.length ? sb.from("organizations").select("id, name").in("id", entityIds) : Promise.resolve({ data: [] }),
    tplIds.length ? sb.from("document_templates").select("id, name").in("id", tplIds) : Promise.resolve({ data: [] }),
  ]);
  const entMap = Object.fromEntries(((ents ?? []) as any[]).map((e) => [e.id, e.name]));
  const tplMap = Object.fromEntries(((tpls ?? []) as any[]).map((t) => [t.id, t.name]));

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      employee_name: (r.resolved_values as any)?.employee_name ?? "",
      entity_name: entMap[r.issuing_entity_id] ?? "",
      template_name: tplMap[r.template_id] ?? "",
      status: r.status,
      sent_at: r.sent_at,
      created_at: r.created_at,
    })),
  };
}

export async function getDraftPreviewUrl(issuedId: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  const { data } = await sb.from("issued_documents").select("draft_pdf_url, org_id, group_id").eq("id", issuedId).maybeSingle();
  if (!data || !inScope(data as any, scope)) return { success: false, error: "Not found" };
  const path = (data as any).draft_pdf_url;
  if (!path) return { success: false, error: "No draft PDF yet" };
  const url = await getSignedDocUrl(sb, path);
  if (!url) return { success: false, error: "Could not generate link" };
  return { success: true, data: { url } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public acknowledgement flow (no auth; token + status gated)
// ─────────────────────────────────────────────────────────────────────────────
export interface AckView {
  status: string;
  employee_name: string;
  entity_name: string;
  document_title: string;
  clauses: RenderedClause[];
  acknowledgement_statement: string;
  expired: boolean;
}

/** Fetch the document for the public ack page; marks it viewed on first open. */
export async function getIssuedDocumentForAck(token: string): Promise<ActionResult<AckView>> {
  if (!token) return { success: false, error: "Missing token" };
  const sb = createAdminSupabase();
  const { data } = await sb
    .from("issued_documents")
    .select("id, status, rendered_body, resolved_values, issuing_entity_id, template_id, ack_token_expires_at")
    .eq("ack_token", token)
    .maybeSingle();
  if (!data) return { success: false, error: "Document not found" };
  const d = data as any;

  const expired =
    (d.status === "sent" || d.status === "viewed") &&
    d.ack_token_expires_at != null &&
    new Date(d.ack_token_expires_at).getTime() < Date.now();

  if (d.status === "sent" && !expired) {
    await sb.from("issued_documents").update({ status: "viewed", viewed_at: new Date().toISOString() } as any).eq("id", d.id);
  }

  const [{ data: tpl }, { data: entity }] = await Promise.all([
    sb.from("document_templates").select("type, name").eq("id", d.template_id).maybeSingle(),
    sb.from("organizations").select("name").eq("id", d.issuing_entity_id).maybeSingle(),
  ]);

  return {
    success: true,
    data: {
      status: expired ? "expired" : d.status === "sent" ? "viewed" : d.status,
      employee_name: (d.resolved_values as any)?.employee_name ?? "",
      entity_name: (entity as any)?.name ?? "",
      document_title: documentTitleFor((tpl as any)?.type ?? "offer_letter", (tpl as any)?.name),
      clauses: (d.rendered_body ?? []) as RenderedClause[],
      acknowledgement_statement: ACKNOWLEDGEMENT_STATEMENT,
      expired,
    },
  };
}

export async function acknowledgeIssuedDocument(
  token: string,
  signerName: string
): Promise<ActionResult<{ status: "acknowledged" }>> {
  if (!token) return { success: false, error: "Missing token" };
  const name = (signerName ?? "").trim();
  if (name.length < 2) return { success: false, error: "Please type your full name to acknowledge" };

  const sb = createAdminSupabase();
  const { data } = await sb
    .from("issued_documents")
    .select("id, org_id, group_id, employee_id, issuing_entity_id, status, ack_token_expires_at")
    .eq("ack_token", token)
    .maybeSingle();
  if (!data) return { success: false, error: "Document not found" };
  const d = data as any;
  if (d.status !== "sent" && d.status !== "viewed") {
    return { success: false, error: `This document is ${d.status} and can no longer be acknowledged.` };
  }
  if (d.ack_token_expires_at && new Date(d.ack_token_expires_at).getTime() < Date.now()) {
    await sb.from("issued_documents").update({ status: "declined", decline_reason: "expired" } as any).eq("id", d.id);
    return { success: false, error: "This acknowledgement link has expired." };
  }

  const { headers } = await import("next/headers");
  const h = headers();
  const ip = h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "unknown";
  const userAgent = h.get("user-agent") ?? "unknown";

  let result;
  try {
    const provider = getSignatureProvider("typed_ack");
    result = await provider.finalize(sb, d.id, {
      signerName: name,
      ip,
      userAgent,
      acknowledgementText: ACKNOWLEDGEMENT_STATEMENT,
    });
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Could not finalize acknowledgement" };
  }

  const { error: insErr } = await sb.from("signed_records").insert({
    issued_document_id: d.id,
    employee_id: d.employee_id,
    issuing_entity_id: d.issuing_entity_id,
    org_id: d.org_id,
    group_id: d.group_id,
    signed_pdf_url: result.signedPdfPath,
    signer_name: result.signerName,
    signer_ip: result.signerIp,
    user_agent: result.userAgent,
    acknowledgement_text: ACKNOWLEDGEMENT_STATEMENT,
    acknowledged_at: result.acknowledgedAt,
    signature_method: result.signatureMethod,
    esign_provider: result.esignProvider ?? null,
    esign_transaction_id: result.esignTransactionId ?? null,
    esign_certificate_url: result.esignCertificateUrl ?? null,
  } as any);
  if (insErr) return { success: false, error: insErr.message };

  await sb
    .from("issued_documents")
    .update({ status: "acknowledged", responded_at: new Date().toISOString() } as any)
    .eq("id", d.id);

  await notifyAdminsOfAck(sb, d).catch(() => {});
  return { success: true, data: { status: "acknowledged" } };
}

export async function declineIssuedDocument(
  token: string,
  reason?: string
): Promise<ActionResult<{ status: "declined" }>> {
  if (!token) return { success: false, error: "Missing token" };
  const sb = createAdminSupabase();
  const { data } = await sb.from("issued_documents").select("id, status").eq("ack_token", token).maybeSingle();
  if (!data) return { success: false, error: "Document not found" };
  const d = data as any;
  if (d.status !== "sent" && d.status !== "viewed") {
    return { success: false, error: `This document is ${d.status}.` };
  }
  const { error } = await sb
    .from("issued_documents")
    .update({ status: "declined", decline_reason: (reason ?? "").trim() || null, responded_at: new Date().toISOString() } as any)
    .eq("id", d.id);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { status: "declined" } };
}

async function notifyAdminsOfAck(sb: Sb, doc: any) {
  const { data: admins } = await sb
    .from("employees")
    .select("email")
    .eq("org_id", doc.org_id)
    .in("role", ["owner", "admin"])
    .neq("status", "terminated");
  const recipients = ((admins ?? []) as any[]).map((a) => a.email).filter(Boolean);
  if (!recipients.length) return;
  const { resend, FROM_EMAIL } = await import("@/lib/resend");
  await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: "A document was acknowledged",
    html: `<p>A document you issued has been acknowledged. View it in JambaHR → Documents → Signed Records.</p>`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed Records (owner/admin only)
// ─────────────────────────────────────────────────────────────────────────────
export interface SignedRecordRow {
  id: string;
  employee_name: string;
  entity_name: string;
  template_name: string;
  signature_method: string;
  acknowledged_at: string;
  signer_ip: string | null;
  issuing_entity_id: string;
}

export async function listSignedRecords(): Promise<ActionResult<SignedRecordRow[]>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);

  const q = applyScopeFilter(
    sb
      .from("signed_records")
      .select("id, signer_name, signature_method, acknowledged_at, signer_ip, issuing_entity_id, issued_document_id, org_id, group_id") as any,
    scope
  ).order("acknowledged_at", { ascending: false });
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as any[];
  const issuedIds = [...new Set(rows.map((r) => r.issued_document_id))];
  const entityIds = [...new Set(rows.map((r) => r.issuing_entity_id))];
  const [{ data: issued }, { data: ents }] = await Promise.all([
    issuedIds.length ? sb.from("issued_documents").select("id, resolved_values, template_id").in("id", issuedIds) : Promise.resolve({ data: [] }),
    entityIds.length ? sb.from("organizations").select("id, name").in("id", entityIds) : Promise.resolve({ data: [] }),
  ]);
  const issuedMap = Object.fromEntries(((issued ?? []) as any[]).map((i) => [i.id, i]));
  const tplIds = [...new Set(((issued ?? []) as any[]).map((i) => i.template_id))];
  const { data: tpls } = tplIds.length
    ? await sb.from("document_templates").select("id, name").in("id", tplIds)
    : { data: [] };
  const tplMap = Object.fromEntries(((tpls ?? []) as any[]).map((t) => [t.id, t.name]));
  const entMap = Object.fromEntries(((ents ?? []) as any[]).map((e) => [e.id, e.name]));

  return {
    success: true,
    data: rows.map((r) => {
      const iss = issuedMap[r.issued_document_id];
      return {
        id: r.id,
        employee_name: r.signer_name || (iss?.resolved_values as any)?.employee_name || "",
        entity_name: entMap[r.issuing_entity_id] ?? "",
        template_name: iss ? tplMap[iss.template_id] ?? "" : "",
        signature_method: r.signature_method,
        acknowledged_at: r.acknowledged_at,
        signer_ip: r.signer_ip,
        issuing_entity_id: r.issuing_entity_id,
      };
    }),
  };
}

export async function getSignedRecordDownloadUrl(id: string): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireAdminCtx();
  if ("error" in ctx) return { success: false, error: ctx.error };
  const { sb, user } = ctx;
  const scope = await resolveDocScope(sb, user.orgId);
  const { data } = await sb.from("signed_records").select("signed_pdf_url, org_id, group_id").eq("id", id).maybeSingle();
  if (!data || !inScope(data as any, scope)) return { success: false, error: "Not found" };
  const url = await getSignedDocUrl(sb, (data as any).signed_pdf_url);
  if (!url) return { success: false, error: "Could not generate link" };
  return { success: true, data: { url } };
}
