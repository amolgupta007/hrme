import { describe, it, expect, vi, beforeEach } from "vitest";

// Proves the D4 multi-org fix: approvePunch/rejectPunch/approveOvertime/
// rejectOvertime/approveDisbursement resolve the org via
// `getCurrentUser({ orgIdHint })` (mobile X-Org-Id) instead of the cookie-only
// path — and that omitting the hint preserves the web (cookie) path
// byte-for-byte (`orgIdHint: undefined`).
//
// We only assert the getCurrentUser call args. Downstream Supabase reads are
// stubbed to return null/empty so each action short-circuits with a clean
// "not found"-style ActionResult before touching any business logic we don't
// care about here.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function userForHint(orgIdHint?: string | null) {
  const orgB = orgIdHint === "org-B";
  return {
    orgId: orgB ? "org-B" : "org-A",
    orgName: orgB ? "OrgB" : "OrgA",
    clerkUserId: "clerk_1",
    role: "admin" as const, // admin so all the approve/reject role gates pass
    employeeId: orgB ? "emp-B" : "emp-A",
    firstName: "Priya",
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
}

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => role === "owner" || role === "admin" || role === "manager",
}));

// Generic Supabase stub: every terminal read resolves to null/empty so each
// action under test hits its early "not found" return right after the
// getCurrentUser() call we're asserting on.
function makeSupabaseStub() {
  const b: any = {};
  b.select = () => b;
  b.update = () => b;
  b.insert = () => b;
  b.eq = () => b;
  b.in = () => b;
  b.neq = () => b;
  b.single = () => Promise.resolve({ data: null, error: null });
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  b.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: null, error: null }).then(resolve, reject);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: () => makeSupabaseStub() }),
}));

// attendance-punches.ts pulls in getManagerScopedEmployeeIds for role==='manager'
// only; role is 'admin' in this test so it's never invoked, but the module
// still needs to resolve.
vi.mock("@/lib/attendance/manager-scope", () => ({
  getManagerScopedEmployeeIds: vi.fn().mockResolvedValue([]),
}));

import { approvePunch, rejectPunch } from "../../src/actions/attendance-punches";
import { approveOvertime, rejectOvertime } from "../../src/actions/overtime";
import { approveDisbursement } from "../../src/actions/disbursement";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockImplementation(async (opts?: { orgIdHint?: string | null }) =>
    userForHint(opts?.orgIdHint),
  );
});

describe("approvals actions — orgIdHint threading (mobile BFF, D4)", () => {
  it("approvePunch(id, 'org-B') passes the hint through to getCurrentUser", async () => {
    await approvePunch("punch1", "org-B");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
  });

  it("approvePunch(id) with no hint preserves the web/cookie path", async () => {
    await approvePunch("punch1");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: undefined });
  });

  it("rejectPunch(id, reason, 'org-B') passes the hint through to getCurrentUser", async () => {
    await rejectPunch("punch1", "not valid", "org-B");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
  });

  it("rejectPunch(id, reason) with no hint preserves the web/cookie path", async () => {
    await rejectPunch("punch1", "not valid");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: undefined });
  });

  it("approveOvertime(id, 'org-B') passes the hint through to getCurrentUser", async () => {
    await approveOvertime("ot1", "org-B");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
  });

  it("approveOvertime(id) with no hint preserves the web/cookie path", async () => {
    await approveOvertime("ot1");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: undefined });
  });

  it("rejectOvertime(id, reason, 'org-B') passes the hint through to getCurrentUser", async () => {
    await rejectOvertime("ot1", "no", "org-B");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
  });

  it("rejectOvertime(id, reason) with no hint preserves the web/cookie path", async () => {
    await rejectOvertime("ot1", "no");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: undefined });
  });

  it("approveDisbursement(id, 'org-B') passes the hint through to getCurrentUser", async () => {
    await approveDisbursement("batch1", "org-B");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-B" });
  });

  it("approveDisbursement(id) with no hint preserves the web/cookie path", async () => {
    await approveDisbursement("batch1");
    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: undefined });
  });
});
