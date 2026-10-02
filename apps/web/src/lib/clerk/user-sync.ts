// What a Clerk `user.updated` event may change on our employees rows. Pure.
//
// Staff accounts are created in Clerk WITHOUT a name — names live in JambaHR —
// so a profile event (e.g. setting a password) arrives with empty names. The
// old handler wrote `first_name || ""` and wiped real names (Sameer and Sakshi
// at Medialoop, 2026-10). Only values Clerk actually has are synced now.
export interface ClerkUserFields {
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

export interface EmployeeClerkUpdate {
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

export function employeeUpdateFromClerk(data: ClerkUserFields): EmployeeClerkUpdate {
  const update: EmployeeClerkUpdate = {};
  const first = data.first_name?.trim();
  const last = data.last_name?.trim();
  if (first) update.first_name = first;
  if (last) update.last_name = last;
  if (data.image_url) update.avatar_url = data.image_url;
  return update;
}

// Which of the employee's JambaHR sign-in identifiers a Clerk login has lost.
// Pure.
//
// JambaHR owns each employee's work email and phone. A staff member can remove
// either from their own Clerk login (Sakshi at Medialoop, 2026-10), and then
// email sign-in answers "Couldn't find your account" even though the employee
// row is intact. The webhook uses this to put them back.
export interface ClerkIdentifiers {
  email_addresses?: { email_address?: string | null }[] | null;
  phone_numbers?: { phone_number?: string | null }[] | null;
}

export interface EmployeeIdentifiers {
  email: string | null;
  phone: string | null;
}

export function missingEmployeeIdentifiers(
  clerk: ClerkIdentifiers,
  employees: EmployeeIdentifiers[],
  normalizePhone: (raw: string | null | undefined) => string | null
): EmployeeIdentifiers[] {
  const emails = new Set(
    (clerk.email_addresses ?? [])
      .map((e) => e.email_address?.trim().toLowerCase())
      .filter((e): e is string => !!e)
  );
  const phones = new Set(
    (clerk.phone_numbers ?? [])
      .map((p) => normalizePhone(p.phone_number))
      .filter((p): p is string => !!p)
  );

  const missing: EmployeeIdentifiers[] = [];
  const seen = new Set<string>();
  for (const row of employees) {
    const email = row.email?.trim().toLowerCase() || null;
    const phone = normalizePhone(row.phone);
    const lostEmail = email && !emails.has(email) ? email : null;
    const lostPhone = phone && !phones.has(phone) ? phone : null;
    if (!lostEmail && !lostPhone) continue;
    const key = `${lostEmail ?? ""}|${lostPhone ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    missing.push({ email: lostEmail, phone: lostPhone });
  }
  return missing;
}
