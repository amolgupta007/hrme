export const ACTIVE_ORG_COOKIE = "jambahr_active_org";

/**
 * Pick the active org id from a caller's memberships and the active-org cookie.
 * The cookie is only honored when the caller is actually a member of that org
 * (the membership list is the authority — a tampered cookie can't select a
 * non-member org). Falls back to the first membership; null if none.
 */
export function resolveActiveOrg(
  memberships: { orgId: string }[],
  cookieOrgId: string | null | undefined
): string | null {
  if (memberships.length === 0) return null;
  if (cookieOrgId && memberships.some((m) => m.orgId === cookieOrgId)) {
    return cookieOrgId;
  }
  return memberships[0].orgId;
}
