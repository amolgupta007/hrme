import { describe, it, expect, vi, beforeEach } from "vitest";

// Finding 1 (Important, push-task14): addManualPunch's pending-path
// approval-notify block unioned managerIdsOf(employee) with the employee's
// department head_id — but never excluded the SUBMITTER themselves. A dept
// head filing their own punch correction is their own department's head_id,
// so they were pinged about their own just-filed request. This drives the
// real addManualPunch action end-to-end and asserts the submitter never
// appears in the notified set.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendPushMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/mobile/push", () => ({
  sendPush: (...args: unknown[]) => sendPushMock(...args),
}));

const DEPT_HEAD_ID = "11111111-1111-4111-8111-111111111111";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";

const mockUser = {
  orgId: "org-1",
  orgName: "Acme",
  clerkUserId: "clerk_dept_head",
  role: "manager" as const, // dept head — a manager, not an admin, so the add lands pending
  employeeId: DEPT_HEAD_ID,
  firstName: "Dev",
  employmentType: "full_time" as const,
  plan: "business" as const,
  customFeatures: null,
  jambaHireEnabled: false,
  assistantEnabled: false,
  assistantTenantDocsEnabled: false,
  attendanceEnabled: true,
  attendancePayrollEnabled: false,
  grievancesEnabled: false,
  jambaGeoEnabled: false,
};

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => mockUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => role === "owner" || role === "admin" || role === "manager",
}));

vi.mock("@/lib/attendance/manager-scope", () => ({
  getManagerScopedEmployeeIds: vi.fn(async () => [DEPT_HEAD_ID]),
}));

vi.mock("@/lib/attendance/adms-ingest", () => ({
  recomputeAttendanceDay: vi.fn(async () => undefined),
}));

function tableProxy(table: string) {
  const b: any = {};
  b.select = () => b;
  b.eq = () => b;

  if (table === "attendance_punch_events") {
    b.insert = () => ({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "punch-1" }, error: null }),
      }),
    });
  } else if (table === "attendance_punch_audit") {
    b.insert = () => Promise.resolve({ data: null, error: null });
  } else if (table === "employees") {
    // The employee row fetched inside the notify block: the dept head,
    // filing for THEMSELVES, no reporting managers set, in DEPT_ID.
    b.single = () =>
      Promise.resolve({
        data: {
          first_name: "Dev",
          last_name: "Head",
          reporting_manager_id: null,
          reporting_manager_2_id: null,
          department_id: DEPT_ID,
        },
        error: null,
      });
  } else if (table === "departments") {
    // Dept head_id === the submitter's own employee id.
    b.single = () => Promise.resolve({ data: { head_id: DEPT_HEAD_ID }, error: null });
  } else if (table === "notifications") {
    b.insert = () => Promise.resolve({ data: null, error: null });
  } else {
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.single = () => Promise.resolve({ data: null, error: null });
  }
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (table: string) => tableProxy(table) }),
}));

import { addManualPunch } from "../../src/actions/attendance-punches";
import { istTodayDate } from "@/lib/attendance/manual-punch-validation";

beforeEach(() => {
  sendPushMock.mockClear();
});

describe("addManualPunch — self-submit never notifies the submitter", () => {
  it("a dept head filing their own punch correction (dept.head_id === themselves) is not paged", async () => {
    const res = await addManualPunch({
      employeeId: DEPT_HEAD_ID,
      punchedAtLocal: `${istTodayDate()}T09:00`,
      punchType: "in",
      note: "forgot to punch in",
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.status).toBe("pending"); // manager add, not auto-approved
    }

    // recipientIds resolves to just DEPT_HEAD_ID (their own dept head_id, no
    // other reporting managers) — which must be excluded, so no push fires.
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
