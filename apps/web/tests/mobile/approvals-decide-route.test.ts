import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

const approveLeaveMock = vi.hoisted(() => vi.fn());
const rejectLeaveMock = vi.hoisted(() => vi.fn());
const approvePunchMock = vi.hoisted(() => vi.fn());
const rejectPunchMock = vi.hoisted(() => vi.fn());
const approveOvertimeMock = vi.hoisted(() => vi.fn());
const rejectOvertimeMock = vi.hoisted(() => vi.fn());
const approveDisbursementMock = vi.hoisted(() => vi.fn());
const scopeMock = vi.hoisted(() => vi.fn(async () => ["emp-2"]));

// Per-table canned result for the leave-scope-guard's `leave_requests` lookup
// (mirrors the `makeChain` idiom in leave-routes.test.ts). Only `single`
// (maybeSingle()) is exercised by this route.
type TableCfg = { single?: any };
const tableConfig: Record<string, TableCfg> = {};
function resetTableConfig() {
  tableConfig.leave_requests = { single: { id: "lr-1", employee_id: "emp-2" } };
}
function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
  };
  return chain;
}

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (r: string) => r === "owner" || r === "admin",
  isManagerOrAbove: (r: string) => r === "owner" || r === "admin" || r === "manager",
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/attendance/manager-scope", () => ({ getManagerScopedEmployeeIds: scopeMock }));
vi.mock("@/actions/leaves", () => ({
  approveLeave: approveLeaveMock,
  rejectLeave: rejectLeaveMock,
}));
vi.mock("@/actions/attendance-punches", () => ({
  approvePunch: approvePunchMock,
  rejectPunch: rejectPunchMock,
}));
vi.mock("@/actions/overtime", () => ({
  approveOvertime: approveOvertimeMock,
  rejectOvertime: rejectOvertimeMock,
}));
vi.mock("@/actions/disbursement", () => ({
  approveDisbursement: approveDisbursementMock,
}));

import { POST } from "@/app/api/mobile/approvals/decide/route";

function req(bodyObj: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost/api/mobile/approvals/decide", {
    method: "POST",
    body: JSON.stringify(bodyObj),
    headers: { "content-type": "application/json", ...headers },
  }) as any;
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...MANAGER };
  resetTableConfig();
  scopeMock.mockResolvedValue(["emp-2"]);
  approveLeaveMock.mockResolvedValue({ success: true, data: undefined });
  rejectLeaveMock.mockResolvedValue({ success: true, data: undefined });
  approvePunchMock.mockResolvedValue({ success: true, data: undefined });
  rejectPunchMock.mockResolvedValue({ success: true, data: undefined });
  approveOvertimeMock.mockResolvedValue({ success: true, data: undefined });
  rejectOvertimeMock.mockResolvedValue({ success: true, data: undefined });
  approveDisbursementMock.mockResolvedValue({ success: true, data: { status: "processing", pushed: 3, failed: 0 } });
});

describe("POST /api/mobile/approvals/decide — auth", () => {
  it("401 unauthenticated when there's no Clerk session", async () => {
    clerkUserId = null;
    const res = await POST(req({ type: "leave", id: "r-1", action: "approve" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("403 no_membership when the user has no org membership", async () => {
    currentUser = null;
    const res = await POST(req({ type: "leave", id: "r-1", action: "approve" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });

  it("403 forbidden for an employee role", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await POST(req({ type: "leave", id: "r-1", action: "approve" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(approveLeaveMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/mobile/approvals/decide — validation", () => {
  it("400 invalid_body on a malformed payload", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(req({ type: "not-a-type", id: "r-1", action: "approve" }));
    expect(res.status).toBe(400);
  });

  it.each(["leave", "regularization", "ot"])(
    "400 comment_required for %s reject without a comment",
    async (type) => {
      currentUser = { ...ADMIN };
      const res = await POST(req({ type, id: "r-1", action: "reject" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("comment_required");
      expect(approveLeaveMock).not.toHaveBeenCalled();
      expect(rejectLeaveMock).not.toHaveBeenCalled();
      expect(approvePunchMock).not.toHaveBeenCalled();
      expect(rejectPunchMock).not.toHaveBeenCalled();
      expect(approveOvertimeMock).not.toHaveBeenCalled();
      expect(rejectOvertimeMock).not.toHaveBeenCalled();
    },
  );

  it("400 'Reject payroll on web' for payroll reject (even as admin, even with a comment)", async () => {
    currentUser = { ...ADMIN };
    const res = await POST(req({ type: "payroll", id: "batch-1", action: "reject", comment: "no" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Reject payroll on web");
    expect(approveDisbursementMock).not.toHaveBeenCalled();
  });

  it("403 forbidden for payroll approve by a non-admin (manager)", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(req({ type: "payroll", id: "batch-1", action: "approve" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(approveDisbursementMock).not.toHaveBeenCalled();
  });

  it("403 forbidden for payroll reject by a non-admin (manager) — admin check wins over the 400", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(req({ type: "payroll", id: "batch-1", action: "reject", comment: "no" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });
});

describe("POST /api/mobile/approvals/decide — dispatch", () => {
  it("leave approve → approveLeave(id, comment, orgIdHint)", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(
      req({ type: "leave", id: "lr-1", action: "approve", comment: "ok" }, { "x-org-id": "org-9" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: undefined });
    expect(approveLeaveMock).toHaveBeenCalledWith("lr-1", "ok", "org-9");
  });

  it("leave reject → rejectLeave(id, comment, orgIdHint)", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(
      req({ type: "leave", id: "lr-1", action: "reject", comment: "no" }, { "x-org-id": "org-9" }),
    );
    expect(res.status).toBe(200);
    expect(rejectLeaveMock).toHaveBeenCalledWith("lr-1", "no", "org-9");
  });

  it("regularization approve → approvePunch(id, orgIdHint)", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(
      req({ type: "regularization", id: "pe-1", action: "approve" }, { "x-org-id": "org-9" }),
    );
    expect(res.status).toBe(200);
    expect(approvePunchMock).toHaveBeenCalledWith("pe-1", "org-9");
  });

  it("regularization reject → rejectPunch(id, comment, orgIdHint)", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(
      req({ type: "regularization", id: "pe-1", action: "reject", comment: "bad" }, { "x-org-id": "org-9" }),
    );
    expect(res.status).toBe(200);
    expect(rejectPunchMock).toHaveBeenCalledWith("pe-1", "bad", "org-9");
  });

  it("ot approve → approveOvertime(id, orgIdHint)", async () => {
    currentUser = { ...ADMIN };
    const res = await POST(req({ type: "ot", id: "ot-1", action: "approve" }, { "x-org-id": "org-9" }));
    expect(res.status).toBe(200);
    expect(approveOvertimeMock).toHaveBeenCalledWith("ot-1", "org-9");
  });

  it("ot reject → rejectOvertime(id, comment, orgIdHint)", async () => {
    currentUser = { ...ADMIN };
    const res = await POST(
      req({ type: "ot", id: "ot-1", action: "reject", comment: "bad" }, { "x-org-id": "org-9" }),
    );
    expect(res.status).toBe(200);
    expect(rejectOvertimeMock).toHaveBeenCalledWith("ot-1", "bad", "org-9");
  });

  it("payroll approve → approveDisbursement(batchId, orgIdHint)", async () => {
    currentUser = { ...ADMIN };
    const res = await POST(req({ type: "payroll", id: "batch-1", action: "approve" }, { "x-org-id": "org-9" }));
    expect(res.status).toBe(200);
    expect(approveDisbursementMock).toHaveBeenCalledWith("batch-1", "org-9");
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: "processing", pushed: 3, failed: 0 },
    });
  });

  it("passes null orgIdHint when no x-org-id header is present", async () => {
    currentUser = { ...MANAGER };
    const res = await POST(req({ type: "leave", id: "lr-1", action: "approve" }));
    expect(res.status).toBe(200);
    expect(approveLeaveMock).toHaveBeenCalledWith("lr-1", undefined, null);
  });
});

describe("POST /api/mobile/approvals/decide — leave manager-team scope (CRITICAL)", () => {
  it("403 forbidden when the leave request's employee is OUTSIDE the manager's scope", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: { id: "lr-9", employee_id: "emp-9" } };
    scopeMock.mockResolvedValue(["emp-2"]); // emp-9 not in scope
    const res = await POST(req({ type: "leave", id: "lr-9", action: "approve" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
    expect(approveLeaveMock).not.toHaveBeenCalled();
  });

  it("dispatches for a leave request IN the manager's scope", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: { id: "lr-2", employee_id: "emp-2" } };
    scopeMock.mockResolvedValue(["emp-2"]);
    const res = await POST(
      req({ type: "leave", id: "lr-2", action: "approve" }, { "x-org-id": "org-9" }),
    );
    expect(res.status).toBe(200);
    expect(scopeMock).toHaveBeenCalledWith("org-1", "emp-1");
    expect(approveLeaveMock).toHaveBeenCalledWith("lr-2", undefined, "org-9");
  });

  it("admin bypasses the scope check for leave", async () => {
    currentUser = { ...ADMIN };
    tableConfig.leave_requests = { single: { id: "lr-3", employee_id: "emp-77" } };
    const res = await POST(req({ type: "leave", id: "lr-3", action: "approve" }));
    expect(res.status).toBe(200);
    expect(scopeMock).not.toHaveBeenCalled();
    expect(approveLeaveMock).toHaveBeenCalled();
  });

  it("404 not_found when the leave request isn't in the caller's org", async () => {
    currentUser = { ...MANAGER };
    tableConfig.leave_requests = { single: null };
    const res = await POST(req({ type: "leave", id: "lr-missing", action: "approve" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
    expect(approveLeaveMock).not.toHaveBeenCalled();
  });

  it("regularization/ot/payroll types are unaffected by the leave scope guard", async () => {
    currentUser = { ...ADMIN };
    tableConfig.leave_requests = { single: null }; // would 404 if the leave path ran
    const res = await POST(req({ type: "ot", id: "ot-1", action: "approve" }));
    expect(res.status).toBe(200);
    expect(approveOvertimeMock).toHaveBeenCalledWith("ot-1", null);
  });
});

describe("POST /api/mobile/approvals/decide — action failure passthrough", () => {
  it("maps a failed ActionResult to 400 with the action's error", async () => {
    currentUser = { ...MANAGER };
    approvePunchMock.mockResolvedValue({ success: false, error: "Punch not found" });
    const res = await POST(req({ type: "regularization", id: "pe-x", action: "approve" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Punch not found");
  });
});
