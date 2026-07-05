/**
 * Company-group DB helpers. Plain module (NOT "use server") so both the ADMS
 * ingest path and server actions can import it without exposing a callable RPC.
 * All reads take a service-role client (passed in) — grouping is platform wiring.
 */
import type { createAdminSupabase } from "@/lib/supabase/server";

type Sb = ReturnType<typeof createAdminSupabase>;

/** The group id an org belongs to, or null if ungrouped. */
export async function getOrgGroupId(sb: Sb, orgId: string): Promise<string | null> {
  const { data } = await sb
    .from("org_group_memberships")
    .select("group_id")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as { group_id: string } | null)?.group_id ?? null;
}

/** All org ids in a group. */
export async function getGroupOrgIds(sb: Sb, groupId: string): Promise<string[]> {
  const { data } = await sb
    .from("org_group_memberships")
    .select("org_id")
    .eq("group_id", groupId);
  return ((data ?? []) as { org_id: string }[]).map((r) => r.org_id);
}

/** Sibling org ids in the same group (excluding `orgId`); [] if ungrouped. */
export async function getSiblingOrgIds(sb: Sb, orgId: string): Promise<string[]> {
  const groupId = await getOrgGroupId(sb, orgId);
  if (!groupId) return [];
  const all = await getGroupOrgIds(sb, groupId);
  return all.filter((id) => id !== orgId);
}

/**
 * The cross-org write gate: true only when both orgs resolve to the SAME
 * non-null group. Called defensively before stamping a cross-org punch.
 */
export async function assertSameGroup(sb: Sb, orgA: string, orgB: string): Promise<boolean> {
  if (orgA === orgB) return true;
  const [ga, gb] = await Promise.all([getOrgGroupId(sb, orgA), getOrgGroupId(sb, orgB)]);
  return ga !== null && ga === gb;
}

/** All location ids owned by the org's group members (for zone union). [] if ungrouped. */
export async function getGroupLocationIds(sb: Sb, orgId: string): Promise<string[]> {
  const groupId = await getOrgGroupId(sb, orgId);
  if (!groupId) return [];
  const orgIds = await getGroupOrgIds(sb, groupId);
  if (orgIds.length === 0) return [];
  const { data } = await sb.from("locations").select("id").in("org_id", orgIds);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}
