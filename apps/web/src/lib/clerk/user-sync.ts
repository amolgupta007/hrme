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
