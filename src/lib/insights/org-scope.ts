export type EligibleOrg = { id: string; name: string };

/**
 * Resolve the set of org ids an Insights query may span.
 *
 * `eligible` is the caller's owner/admin org list (authority). `requested` is
 * the client-supplied selection (untrusted). We keep only requested ids that
 * appear in `eligible`, in eligible-set order, deduped. If the request is
 * absent or filters to empty, fall back to the active org. The active org is
 * only honored if it is itself eligible.
 */
export function resolveScopedOrgIds(
  eligible: EligibleOrg[],
  requested: string[] | null | undefined,
  activeOrgId: string
): { orgIds: string[]; orgs: EligibleOrg[] } {
  const byId = new Map(eligible.map((o) => [o.id, o]));

  let ids: string[];
  if (requested && requested.length > 0) {
    const wanted = new Set(requested);
    ids = eligible.map((o) => o.id).filter((id) => wanted.has(id));
  } else {
    ids = [];
  }

  if (ids.length === 0) {
    ids = byId.has(activeOrgId) ? [activeOrgId] : [];
  }

  return { orgIds: ids, orgs: ids.map((id) => byId.get(id)!).filter(Boolean) };
}
