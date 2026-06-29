import type { clerkClient } from "@clerk/nextjs/server";
import type { UserRole } from "@/types";
import { normalizePhone } from "@/lib/phone";

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

export type SyncIdentifiersOpts = {
  email: string | null;
  phoneE164: string | null;
  role: UserRole;
  /** The employee's already-linked Clerk user id, if any. */
  existingClerkUserId?: string | null;
};

export type SyncIdentifiersResult = {
  /** Clerk user id to link onto the employees row (null if nothing to do). */
  clerkUserId: string | null;
  addedPhone: boolean;
  addedEmail: boolean;
  created: boolean;
};

/**
 * Make an employee's email AND phone both usable as Clerk sign-in identifiers.
 *
 * A phone (or email) sitting in the `employees` table is just app data — Clerk
 * sign-in only finds a user that carries the identifier. This resolves (or
 * creates) the one Clerk user for this person and attaches whichever of
 * email/phone is missing, marked verified (admin-provisioned, so no OTP step).
 *
 * Resolution order: existing linked user → user matching the phone → user
 * matching the email → create a new user. Idempotent: skips identifiers the
 * Clerk user already has, so it's safe to call on every add/update.
 *
 * Best-effort by contract — callers should treat a throw as non-fatal (the
 * employees row is the source of truth; Clerk linking can be retried).
 */
export async function syncEmployeeAuthIdentifiers(
  client: ClerkClient,
  opts: SyncIdentifiersOpts
): Promise<SyncIdentifiersResult> {
  const email = opts.email?.trim().toLowerCase() || null;
  const phone = normalizePhone(opts.phoneE164);

  if (!email && !phone) {
    return { clerkUserId: opts.existingClerkUserId ?? null, addedPhone: false, addedEmail: false, created: false };
  }

  // 1. Resolve the target Clerk user.
  let userId = opts.existingClerkUserId ?? null;
  let created = false;

  if (!userId && phone) {
    const byPhone = await client.users.getUserList({ phoneNumber: [phone] });
    if (byPhone.data.length > 0) userId = byPhone.data[0].id;
  }
  if (!userId && email) {
    const byEmail = await client.users.getUserList({ emailAddress: [email] });
    if (byEmail.data.length > 0) userId = byEmail.data[0].id;
  }

  if (!userId) {
    const createdUser = await client.users.createUser({
      ...(email ? { emailAddress: [email] } : {}),
      ...(phone ? { phoneNumber: [phone] } : {}),
      skipPasswordRequirement: true,
    });
    // createUser sets the supplied identifiers as verified — both are sign-in ready.
    return {
      clerkUserId: createdUser.id,
      addedPhone: !!phone,
      addedEmail: !!email,
      created: true,
    };
  }

  // 2. User exists — attach whichever identifier it's missing.
  const user = await client.users.getUser(userId);
  let addedPhone = false;
  let addedEmail = false;

  if (phone) {
    const hasPhone = user.phoneNumbers.some(
      (p) => normalizePhone(p.phoneNumber) === phone
    );
    if (!hasPhone) {
      await client.phoneNumbers.createPhoneNumber({
        userId,
        phoneNumber: phone,
        verified: true,
      });
      addedPhone = true;
    }
  }

  if (email) {
    const hasEmail = user.emailAddresses.some(
      (e) => e.emailAddress.toLowerCase() === email
    );
    if (!hasEmail) {
      await client.emailAddresses.createEmailAddress({
        userId,
        emailAddress: email,
        verified: true,
      });
      addedEmail = true;
    }
  }

  return { clerkUserId: userId, addedPhone, addedEmail, created };
}
