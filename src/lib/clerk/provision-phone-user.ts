import type { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@/types";

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

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

  try {
    await client.organizations.createOrganizationMembership({
      organizationId: clerkOrgId,
      userId: clerkUserId,
      role: clerkOrgRole(role),
    });
  } catch (err: any) {
    const code = err?.errors?.[0]?.code;
    if (code !== "already_a_member_of_organization") throw err;
  }

  return { clerkUserId };
}
