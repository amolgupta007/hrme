import type { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@/types";

type ClerkClient = Awaited<ReturnType<typeof clerkClient>>;

export type ProvisionOpts = { phoneE164: string; role: UserRole };

/**
 * Find-or-create a Clerk user by phone number. Membership is the employees row,
 * so we no longer add a Clerk org membership (that was the quota-limited call
 * that raised `organization membership quota exceeded`). The caller links the
 * returned `clerkUserId` onto the employees row.
 *
 * `role` is kept in the signature so call sites don't break and to document
 * intent, but it no longer maps to a Clerk org role.
 */
export async function provisionPhoneOnlyUser(
  client: ClerkClient,
  opts: ProvisionOpts
): Promise<{ clerkUserId: string }> {
  const { phoneE164 } = opts;
  const existing = await client.users.getUserList({ phoneNumber: [phoneE164] });
  if (existing.data.length > 0) {
    if (existing.data.length > 1) {
      console.warn(
        `provisionPhoneOnlyUser: ${existing.data.length} Clerk users match ${phoneE164}; using the first.`
      );
    }
    return { clerkUserId: existing.data[0].id };
  }
  const created = await client.users.createUser({
    phoneNumber: [phoneE164],
    skipPasswordRequirement: true,
  });
  return { clerkUserId: created.id };
}
