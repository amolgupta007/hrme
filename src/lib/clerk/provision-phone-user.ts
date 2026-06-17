import type { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@/types";

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

/**
 * Clerk orgs default to a tiny per-org membership cap (~5) regardless of account
 * plan. We raise it to this value so memberships (phone provisioning + invite
 * acceptance) aren't blocked as an org grows. Well above the largest JambaHR
 * plan (500 employees); the real business limit stays organizations.max_employees.
 */
export const ORG_MEMBERSHIP_CAP = 1000;

export type ProvisionOpts = {
  phoneE164: string;
  clerkOrgId: string;
  role: UserRole;
};

function clerkOrgRole(role: UserRole): "org:admin" | "org:member" {
  return role === "admin" || role === "owner" ? "org:admin" : "org:member";
}

/**
 * Find-or-create a Clerk user by phone number and add them to the org.
 * Returns the Clerk user id. Idempotent on membership (already-a-member is success).
 * Throws on any other Clerk failure so the caller can surface it.
 */
export async function provisionPhoneOnlyUser(
  client: ClerkClient,
  opts: ProvisionOpts
): Promise<{ clerkUserId: string }> {
  const { phoneE164, clerkOrgId, role } = opts;

  const existing = await client.users.getUserList({ phoneNumber: [phoneE164] });
  let clerkUserId: string;
  if (existing.data.length > 0) {
    // Clerk prevents duplicate verified phones in most flows; take the first match.
    // A >1 result means the same phone is attached to multiple Clerk users — log it
    // so a wrong-user association is debuggable rather than silent.
    if (existing.data.length > 1) {
      console.warn(`provisionPhoneOnlyUser: ${existing.data.length} Clerk users match ${phoneE164}; using the first.`);
    }
    clerkUserId = existing.data[0].id;
  } else {
    const created = await client.users.createUser({
      phoneNumber: [phoneE164],
      skipPasswordRequirement: true,
    });
    clerkUserId = created.id;
  }

  await addMembershipWithCapacityHeal(client, clerkOrgId, clerkUserId, clerkOrgRole(role));

  return { clerkUserId };
}

/**
 * Add an org membership, healing Clerk's per-org membership cap if it's hit.
 * On a quota/limit error we raise the org's maxAllowedMemberships once to
 * ORG_MEMBERSHIP_CAP and retry. already-a-member is treated as success.
 */
async function addMembershipWithCapacityHeal(
  client: ClerkClient,
  clerkOrgId: string,
  clerkUserId: string,
  role: "org:admin" | "org:member"
): Promise<void> {
  try {
    await client.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
      role,
    });
  } catch (err: any) {
    const code = err?.errors?.[0]?.code ?? "";
    const msg = err?.errors?.[0]?.message ?? err?.message ?? "";
    if (code === "already_a_member_of_organization") return;
    const isQuota = /quota/i.test(code) || /quota|membership.*(limit|exceeded)/i.test(msg);
    if (!isQuota) throw err;
    // Org's Clerk member cap is too low — raise it and retry the membership once.
    await client.organizations.updateOrganization(clerkOrgId, {
      maxAllowedMemberships: ORG_MEMBERSHIP_CAP,
    });
    await client.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
      role,
    });
  }
}
