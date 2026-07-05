import type { UserRole } from "@/types";
import { isAdmin } from "@/lib/current-user";
import { mapStageToOutcome, type LeadStage } from "@/lib/geo/stages";

// ---- Scope helper ----

export interface ScopeContext {
  role: UserRole;
  employeeId: string | null;
}

export interface ScopeFilter {
  inAssignedTo: string[];
  includeUnassigned: boolean;
}

export function computeLeadScope(
  ctx: ScopeContext,
  deps: { dept: string[] },
): ScopeFilter | null {
  if (isAdmin(ctx.role)) return null; // null = unrestricted
  if (ctx.role === "manager") {
    return { inAssignedTo: deps.dept, includeUnassigned: true };
  }
  // employee
  return {
    inAssignedTo: ctx.employeeId ? [ctx.employeeId] : [],
    includeUnassigned: false,
  };
}

// ---- System visit builder ----

export function buildSystemVisitForStageMove(args: {
  leadId: string;
  orgId: string;
  employeeId: string;
  from: LeadStage;
  to: LeadStage;
  note?: string;
}): {
  lead_id: string;
  org_id: string;
  employee_id: string;
  outcome: string;
  notes: string;
  source: "web";
  system: true;
} | null {
  if (args.from === args.to) return null;
  const base = `Stage: ${args.from} → ${args.to}`;
  const notes = args.note ? `${base}. ${args.note}` : base;
  return {
    lead_id: args.leadId,
    org_id: args.orgId,
    employee_id: args.employeeId,
    outcome: mapStageToOutcome(args.to),
    notes,
    source: "web" as const,
    system: true as const,
  };
}
