// src/lib/documents/variables.ts
// Placeholder registry + resolution. {{variable}} tokens in clause bodies are
// validated against the declared registry and resolved from the employee record,
// salary structure, issuing entity, and company group at issuance time.
import type { createAdminSupabase } from "@/lib/supabase/server";
import { formatCurrency, formatDate, capitalize } from "@/lib/utils";

type Sb = ReturnType<typeof createAdminSupabase>;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** All {{token}} names used in a markdown string (deduped). */
export function extractPlaceholders(markdown: string): string[] {
  const out = new Set<string>();
  for (const m of markdown.matchAll(PLACEHOLDER_RE)) out.add(m[1]);
  return [...out];
}

/** All placeholders across many clause bodies. */
export function collectPlaceholders(bodies: string[]): string[] {
  const out = new Set<string>();
  for (const b of bodies) for (const p of extractPlaceholders(b)) out.add(p);
  return [...out];
}

/** Placeholders present in bodies that are NOT in the declared registry. */
export function unknownPlaceholders(
  bodies: string[],
  declaredKeys: string[]
): string[] {
  const declared = new Set(declaredKeys);
  return collectPlaceholders(bodies).filter((p) => !declared.has(p));
}

/** Replace {{token}} with resolved values. Unresolved tokens are left visible
 *  as [token] so a missing value is obvious in preview rather than silently blank. */
export function applyVariables(
  markdown: string,
  values: Record<string, string>
): string {
  return markdown.replace(PLACEHOLDER_RE, (_full, key: string) => {
    const v = values[key];
    return v !== undefined && v !== null && v !== "" ? v : `[${key}]`;
  });
}

function humanizeEmploymentType(t: string | null): string {
  if (!t) return "";
  return t
    .split("_")
    .map((s) => capitalize(s))
    .join(" ");
}

function readEntityAddress(settings: unknown): string {
  const s = (settings ?? {}) as Record<string, any>;
  return (
    s.legal?.registered_address ??
    s.registered_address ??
    s.company_address ??
    s.address ??
    ""
  );
}

/**
 * Resolve the full variable map for one employee under a chosen issuing entity.
 * Never throws — missing pieces resolve to "" so the caller (and the [token]
 * fallback) can surface gaps in preview.
 */
export async function resolveVariablesForEmployee(
  sb: Sb,
  args: { employeeId: string; issuingEntityId: string; groupId: string | null }
): Promise<Record<string, string>> {
  const { employeeId, issuingEntityId, groupId } = args;

  const { data: emp } = await sb
    .from("employees")
    .select(
      "first_name, last_name, email, designation, employment_type, date_of_joining, department_id"
    )
    .eq("id", employeeId)
    .maybeSingle();
  const e = (emp ?? {}) as Record<string, any>;

  const [{ data: sal }, { data: entity }, dept, group] = await Promise.all([
    sb.from("salary_structures").select("ctc").eq("employee_id", employeeId).maybeSingle(),
    sb.from("organizations").select("name, settings").eq("id", issuingEntityId).maybeSingle(),
    e.department_id
      ? sb.from("departments").select("name").eq("id", e.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    groupId
      ? sb.from("company_groups").select("name").eq("id", groupId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const entityRow = (entity ?? {}) as Record<string, any>;
  const ctc = (sal as { ctc: number } | null)?.ctc;

  return {
    employee_name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
    designation: e.designation ?? "",
    department: (dept?.data as { name: string } | null)?.name ?? "",
    employment_type: humanizeEmploymentType(e.employment_type ?? null),
    joining_date: e.date_of_joining ? formatDate(e.date_of_joining) : "",
    employee_email: e.email ?? "",
    ctc: typeof ctc === "number" ? formatCurrency(ctc, "INR", "en-IN") : "",
    issuing_entity_name: entityRow.name ?? "",
    issuing_entity_address: readEntityAddress(entityRow.settings),
    group_name: (group?.data as { name: string } | null)?.name ?? "",
    today: formatDate(new Date()),
  };
}
