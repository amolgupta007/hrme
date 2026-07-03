/**
 * Pure cross-org punch attribution decision. Given the host-org match (the
 * employee in the device's OWN org for this PIN, or null) and any matches in
 * SIBLING group orgs, decide where the punch belongs. No DB, no I/O.
 *
 * Host match always wins — this makes dual-employment safe (a person employed
 * by both orgs, punching at their host device, counts for the host). Only a
 * host miss is resolved across the group, and only an unambiguous single match
 * is attributed; anything ambiguous is flagged, never guessed.
 */
export type GroupMatch = { employeeId: string; orgId: string };

export type Attribution =
  | { status: "host"; employeeId: string; orgId: string }
  | { status: "attributed"; employeeId: string; payrollOrgId: string }
  | { status: "ambiguous"; candidateOrgIds: string[] }
  | { status: "unmatched" };

export function decideAttribution(
  hostMatch: { employeeId: string; orgId: string } | null,
  groupMatches: GroupMatch[],
): Attribution {
  if (hostMatch) {
    return { status: "host", employeeId: hostMatch.employeeId, orgId: hostMatch.orgId };
  }
  if (groupMatches.length === 1) {
    return {
      status: "attributed",
      employeeId: groupMatches[0].employeeId,
      payrollOrgId: groupMatches[0].orgId,
    };
  }
  if (groupMatches.length > 1) {
    return { status: "ambiguous", candidateOrgIds: [...new Set(groupMatches.map((m) => m.orgId))] };
  }
  return { status: "unmatched" };
}
