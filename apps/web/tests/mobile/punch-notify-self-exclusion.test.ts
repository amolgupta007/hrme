import { describe, it, expect, vi, beforeEach } from "vitest";

// Finding 1 (Important, push-task14): addManualPunch's pending-path
// approval-notify block unioned managerIdsOf(employee) with the employee's
// department head_id — but excluded the punch's TARGET employeeId instead
// of the actual SUBMITTER (ctx.actor.employeeId). Two cases exercise this:
//   1. A dept head filing their OWN punch correction — coincidentally the
//      target and the submitter are the same id, so the original (buggy)
//      `recipientIds.delete(employeeId)` happened to work.
//   2. A manager filing a punch correction FOR a direct report — target
//      (the report) and submitter (the manager) are DIFFERENT ids, so the
//      original code deleted the wrong one and the manager got paged about
//      the request they just filed themselves.
// Both drive the real addManualPunch action end-to-end and assert the
// submitter never appears in the notified set.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendPushMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/mobile/push", () => ({
  sendPush: (...args: unknown[]) => sendPushMock(...args),
}));

const DEPT_HEAD_ID = "11111111-1111-4111-8111-111111111111";
const DEPT_ID = "22222222-2222-4222-8222-222222222222";
const MANAGER_ID = "33333333-3333-4333-8333-333333333333";
const REPORT_ID = "44444444-4444-4444-8444-444444444444";

// Mutable per-test fixtures read by the mocked Supabase client + mocks below.
let currentUser: any;
let employeesRow: any;
let departmentsRow: any;
let scopedIds: string[] = [];

function baseUser(overrides: Partial<Record<string, unknown>>) {
  return {
    orgId: "org-1",
    orgName: "Acme",
    clerkUserId: "clerk_user",
    role: "manager" as const,
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
    ...overrides,
  };
}

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => role === "owner" || role === "admin" || role === "manager",
}));

vi.mock("@/lib/attendance/manager-scope", () => ({
  getManagerScopedEmployeeIds: vi.fn(async () => scopedIds),
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
    // The target employee row fetched inside the notify block.
    b.single = () => Promise.resolve({ data: employeesRow, error: null });
  } else if (table === "departments") {
    b.single = () => Promise.resolve({ data: departmentsRow, error: null });
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
    currentUser = baseUser({
      clerkUserId: "clerk_dept_head",
      employeeId: DEPT_HEAD_ID, // dept head — a manager, not an admin, so the add lands pending
    });
    employeesRow = {
      first_name: "Dev",
      last_name: "Head",
      reporting_manager_id: null,
      reporting_manager_2_id: null,
      department_id: DEPT_ID,
    };
    departmentsRow = { head_id: DEPT_HEAD_ID }; // dept head_id === the submitter's own id
    scopedIds = [DEPT_HEAD_ID];

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

  it("a manager filing a punch correction FOR a direct report is not paged about their own submission", async () => {
    currentUser = baseUser({
      clerkUserId: "clerk_manager",
      employeeId: MANAGER_ID, // the SUBMITTER, distinct from the punch's target employee
    });
    employeesRow = {
      first_name: "Rep",
      last_name: "Ort",
      reporting_manager_id: MANAGER_ID, // the report's manager-of-record
      reporting_manager_2_id: null,
      department_id: null, // keep the scenario to the reporting-manager path only
    };
    departmentsRow = null;
    scopedIds = [REPORT_ID]; // manager's scope includes the report → canApprovePunch passes

    const res = await addManualPunch({
      employeeId: REPORT_ID, // target: the direct report, NOT the submitter
      punchedAtLocal: `${istTodayDate()}T09:00`,
      punchType: "in",
      note: "forgot to punch in",
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.status).toBe("pending"); // manager add for someone else, still lands pending
    }

    // recipientIds resolves to {MANAGER_ID} (the report's reporting_manager_id).
    // MANAGER_ID is the SUBMITTER (ctx.actor.employeeId), not the target
    // (REPORT_ID). Deleting only the target — the pre-fix behavior — leaves
    // the real submitter in the set and pages them about their own request.
    expect(sendPushMock).not.toHaveBeenCalled();
  });
});
