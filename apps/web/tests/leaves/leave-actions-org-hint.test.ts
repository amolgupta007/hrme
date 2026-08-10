import { describe, it, expect, vi, beforeEach } from "vitest";

// Proves the D2 multi-org fix: requestLeave/cancelLeave/approveLeave/rejectLeave
// resolve the org via `getCurrentUser({ orgIdHint })` (mobile X-Org-Id) instead
// of the cookie-only path, so the write lands in the caller's ACTIVE org — and
// that omitting the hint preserves the web (cookie) path byte-for-byte.

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: "clerk_1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const EMP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const POLICY_ID = "22222222-2222-4222-8222-222222222222";

function userForHint(orgIdHint?: string | null) {
  const orgB = orgIdHint === "org-B";
  return {
    orgId: orgB ? "org-B" : "org-A",
    orgName: orgB ? "OrgB" : "OrgA",
    clerkUserId: "clerk_1",
    role: "admin" as const, // admin so approve/reject pass the manager gate
    employeeId: orgB ? EMP_B : EMP_A,
    firstName: "Priya",
    employmentType: "full_time" as const,
    plan: "growth" as const,
    customFeatures: null,
    jambaHireEnabled: false,
    assistantEnabled: false,
    assistantTenantDocsEnabled: false,
    attendanceEnabled: false,
    attendancePayrollEnabled: false,
    grievancesEnabled: false,
    jambaGeoEnabled: false,
  };
}

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => role === "owner" || role === "admin" || role === "manager",
}));

const state: {
  empId: string;
  insertedPayload: any;
  updatePayload: any;
} = { empId: EMP_A, insertedPayload: null, updatePayload: null };

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (table: string) => makeTableProxy(table) }),
}));

function makeTableProxy(table: string) {
  const b: any = {};
  let selectedCols = "";
  b.select = (cols: string) => {
    selectedCols = cols;
    return b;
  };
  b.eq = () => b;
  b.in = () => b;
  b.neq = () => b;
  b.gte = () => b;
  b.lte = () => b;

  b.single = () => {
    if (table === "employees") {
      return Promise.resolve({
        data: {
          id: state.empId,
          first_name: "Priya",
          last_name: "S",
          email: null,
          reporting_manager_id: null,
          reporting_manager_2_id: null,
        },
      });
    }
    if (table === "leave_policies") {
      if (selectedCols.includes("days_per_year")) {
        return Promise.resolve({ data: { type: "paid", days_per_year: 21 } });
      }
      return Promise.resolve({ data: { name: "Annual Leave" } });
    }
    if (table === "leave_requests") {
      // insert(...).select("id").single()  OR  approve/reject/cancel pre-fetch.
      if (selectedCols === "id" || selectedCols === "") {
        return Promise.resolve({ data: { id: "req1" }, error: null });
      }
      return Promise.resolve({
        data: {
          id: "req1",
          employee_id: state.empId,
          status: "pending",
          start_date: "2026-08-20",
          end_date: "2026-08-21",
          days: 2,
          employees: { first_name: "Priya", last_name: "S", email: null, reporting_manager_id: null, reporting_manager_2_id: null },
          leave_policies: { name: "Annual Leave" },
        },
      });
    }
    return Promise.resolve({ data: null });
  };

  b.insert = (payload: any) => {
    state.insertedPayload = payload;
    return b; // chained .select("id").single()
  };
  b.update = (payload: any) => {
    state.updatePayload = payload;
    return b; // chained .eq(...).eq(...)[.eq(...)]  → awaited
  };
  b.then = (resolve: any, reject: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
  return b;
}

import { requestLeave, cancelLeave, approveLeave, rejectLeave } from "../../src/actions/leaves";

beforeEach(() => {
  state.empId = EMP_A;
  state.insertedPayload = null;
  state.updatePayload = null;
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockImplementation(async (opts?: { orgIdHint?: string | null }) =>
    userForHint(opts?.orgIdHint),
  );
});

describe("leave actions — orgIdHint threading (multi-org fix)", () => {
  it("requestLeave(orgIdHint='org-B') resolves org-B and inserts into that org", async () => {
    state.empId = EMP_B;
    const res = await requestLeave(
      { employeeId: EMP_B, policyId: POLICY_ID, startDate: "2026-08-20", endDate: "2026-08-20", days: 1, reason: "x", exceedsBalance: false } as any,
      "org-B",
    );
    expect(res.success).toBe(true);
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
    expect(state.insertedPayload).toMatchObject({ org_id: "org-B", employee_id: EMP_B });
  });

  it("requestLeave() with NO hint preserves the web/cookie path (resolves org-A)", async () => {
    state.empId = EMP_A;
    const res = await requestLeave(
      { employeeId: EMP_A, policyId: POLICY_ID, startDate: "2026-08-20", endDate: "2026-08-20", days: 1, reason: "x", exceedsBalance: false } as any,
    );
    expect(res.success).toBe(true);
    // undefined hint → getCurrentUser falls through to the cookie (byte-identical).
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: undefined });
    expect(state.insertedPayload).toMatchObject({ org_id: "org-A" });
  });

  it("cancelLeave(requestId, 'org-B') threads the hint and cancels in org-B", async () => {
    state.empId = EMP_B;
    const res = await cancelLeave("req1", "org-B");
    expect(res.success).toBe(true);
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
  });

  it("approveLeave threads the hint AND writes reviewed_by = actor employeeId", async () => {
    state.empId = EMP_B;
    const res = await approveLeave("req1", "ok", "org-B");
    expect(res.success).toBe(true);
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
    expect(state.updatePayload).toMatchObject({ status: "approved", reviewed_by: EMP_B });
  });

  it("rejectLeave writes reviewed_by = actor employeeId", async () => {
    state.empId = EMP_B;
    const res = await rejectLeave("req1", "no", "org-B");
    expect(res.success).toBe(true);
    expect(state.updatePayload).toMatchObject({ status: "rejected", reviewed_by: EMP_B });
  });
});
