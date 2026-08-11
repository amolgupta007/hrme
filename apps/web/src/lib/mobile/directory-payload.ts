import type { MobileDirectoryEntry } from "@jambahr/shared";

/**
 * Pure shaper for the mobile People/Directory endpoint. Employee-safe: only
 * public-facing fields (name, dept, role badge, avatar, contact). NO salary,
 * NO PAN/Aadhaar. No I/O.
 */

/** An `employees` row as the directory route selects it. */
export type DirectoryEmployeeRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  departments?: { name: string | null } | null;
};

function initialsOf(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  const a = f ? f[0] : "";
  const b = l ? l[0] : "";
  const combined = `${a}${b}`.toUpperCase();
  return combined || "?";
}

export function buildDirectory(rows: DirectoryEmployeeRow[]): MobileDirectoryEntry[] {
  return rows.map((e) => ({
    id: e.id,
    name: `${e.first_name} ${e.last_name}`.trim(),
    initials: initialsOf(e.first_name, e.last_name),
    department: e.departments?.name ?? null,
    roleBadge: e.role,
    avatarUrl: e.avatar_url ?? null,
    email: e.email ?? null,
    phone: e.phone ?? null,
  }));
}
