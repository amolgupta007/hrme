// src/lib/documents/scope.ts
// Read-scope resolver reconciling the PRD's "group-scoped" intent with the real
// tenancy model (Clerk decoupled; group = superadmin overlay via company_groups).
// See docs/planning/documents-feature-plan.md §3.
import type { createAdminSupabase } from "@/lib/supabase/server";
import { getOrgGroupId, getGroupOrgIds } from "@/lib/attendance/company-group";

type Sb = ReturnType<typeof createAdminSupabase>;

export interface DocScope {
  orgId: string;
  /** The org's company_group id, or null if ungrouped. */
  groupId: string | null;
  /** Org ids the caller may issue from (self, or all group members). */
  issuingEntityIds: string[];
}

/**
 * Resolve the document read/issue scope for an org.
 *  - Grouped   → reads span the whole group (group_id filter); issuing entities
 *                = all group members.
 *  - Ungrouped → reads are single-org (org_id + group_id IS NULL); issuing
 *                entity = self only.
 */
export async function resolveDocScope(sb: Sb, orgId: string): Promise<DocScope> {
  const groupId = await getOrgGroupId(sb, orgId);
  if (!groupId) {
    return { orgId, groupId: null, issuingEntityIds: [orgId] };
  }
  const memberIds = await getGroupOrgIds(sb, groupId);
  return {
    orgId,
    groupId,
    issuingEntityIds: memberIds.length > 0 ? memberIds : [orgId],
  };
}

/**
 * Apply the scope to a Supabase query builder for a table that carries both
 * org_id and group_id. Grouped → .eq(group_id); ungrouped → .eq(org_id) and
 * group_id IS NULL. Returns the same builder for chaining.
 */
export function applyScopeFilter<T extends { eq: any; is: any }>(
  query: T,
  scope: DocScope
): T {
  if (scope.groupId) {
    return query.eq("group_id", scope.groupId);
  }
  return query.eq("org_id", scope.orgId).is("group_id", null);
}
