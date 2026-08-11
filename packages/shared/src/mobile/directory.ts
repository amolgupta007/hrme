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

/**
 * Mobile BFF DTO for the admin/manager People quick-lookup mini-profile
 * (Mobile PRD-02, Phase D4, Task 6). View-only — NO salary, NO PAN/Aadhaar,
 * NO bank/CTC. Admin/manager only; the target must belong to the caller's
 * org (IDOR-guarded 404 otherwise, like the payslip detail route).
 *
 * Types only. Shaping lives web-side in
 * apps/web/src/lib/mobile/person-profile-payload.ts.
 */
export type MobilePersonTodayAttendance = {
  status: "clocked_in" | "clocked_out";
  clockIn: string | null;
  clockOut: string | null;
} | null;

export type MobilePersonLeaveBalance = {
  type: string; // leave_policies.type (paid | sick | casual | unpaid | ...)
  remaining: number;
};

export type MobilePersonRecentRequest = {
  type: string; // leave_requests.leave_type
  status: string; // pending | approved | rejected | cancelled
  when: string; // start_date, YYYY-MM-DD
};

export type MobilePersonProfile = {
  id: string;
  name: string;
  role: string;
  department: string | null;
  phone: string | null;
  personalEmail: string | null;
  whatsappOptIn: boolean;
  todayAttendance: MobilePersonTodayAttendance;
  leaveBalance: MobilePersonLeaveBalance[];
  recentRequests: MobilePersonRecentRequest[];
};

/** GET /api/mobile/directory/[id] — admin/manager mini-profile for one employee. */
export type MobilePersonProfileResponse = MobilePersonProfile;
