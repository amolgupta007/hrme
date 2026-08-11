/**
 * Mobile BFF DTO for the Staff MVP People/Directory screen (Mobile PRD-02,
 * Phase D Slice 2, Task 4). Employee-safe projection — NO salary, NO PAN/
 * Aadhaar. Any authenticated org member may read it.
 *
 * Types only. Shaping lives web-side in
 * apps/web/src/lib/mobile/directory-payload.ts.
 */
export type MobileDirectoryEntry = {
  id: string;
  name: string;
  initials: string;
  department: string | null;
  roleBadge: string; // employee | manager | admin | owner
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
};

/** GET /api/mobile/directory — active org members, name order. */
export type MobileDirectoryResponse = MobileDirectoryEntry[];
