import { describe, it, expect, beforeEach, vi } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results — mirrors the `makeChain` idiom in
// payslips-profile-directory-routes.test.ts. `single` serves
// maybeSingle()/single(); `rows` serves an awaited (thenable) chain / .limit().
const tableConfig: Record<string, { single?: any; rows?: any[] }> = {};

function resetTableConfig() {
  for (const k of Object.keys(tableConfig)) delete tableConfig[k];
}

function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const awaitResult = { data: cfg.rows ?? [], error: null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve(awaitResult),
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
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

import { GET } from "@/app/api/mobile/directory/[id]/route";

function req(url = "http://localhost/api/mobile/directory/emp-target") {
  return new Request(url) as any;
}
function call(id = "emp-target") {
  return GET(req(), { params: { id } });
}

const EMPLOYEE = { orgId: "org-1", orgName: "Acme", role: "employee", plan: "business", employeeId: "emp-1" };
const MANAGER = { ...EMPLOYEE, role: "manager" };
const ADMIN = { ...EMPLOYEE, role: "admin" };

const targetRow = (over: Record<string, unknown> = {}) => ({
  id: "emp-target",
  org_id: "org-1",
  first_name: "Priya",
  last_name: "Shah",
  role: "employee",
  phone: "+919000000001",
  personal_email: "priya@gmail.com",
  whatsapp_opt_in: true,
  departments: { name: "Engineering" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...MANAGER };
  resetTableConfig();
  tableConfig.employees = { single: targetRow() };
  tableConfig.attendance_records = { single: null };
  tableConfig.leave_policies = { rows: [] };
  tableConfig.leave_requests = { rows: [] };
});

describe("GET /api/mobile/directory/[id] — auth", () => {
  it("401 unauthenticated when no Clerk session", async () => {
    clerkUserId = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthenticated");
  });

  it("403 no_membership when no org membership", async () => {
    currentUser = null;
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_membership");
  });

  it("403 forbidden for a plain employee (not manager+)", async () => {
    currentUser = { ...EMPLOYEE };
    const res = await call();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("200 for a manager", async () => {
    currentUser = { ...MANAGER };
    const res = await call();
    expect(res.status).toBe(200);
  });

  it("200 for an admin", async () => {
    currentUser = { ...ADMIN };
    const res = await call();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/mobile/directory/[id] — IDOR guard", () => {
  it("404 when the target belongs to ANOTHER org", async () => {
    tableConfig.employees = { single: targetRow({ org_id: "org-999" }) };
    const res = await call();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("404 when the target does not exist", async () => {
    tableConfig.employees = { single: null };
    const res = await call();
    expect(res.status).toBe(404);
  });
});

describe("GET /api/mobile/directory/[id] — 200 shape", () => {
  it("returns the mini-profile shape with no salary/PAN/Aadhaar/bank/CTC anywhere in the payload", async () => {
    tableConfig.employees = { single: targetRow() };
    tableConfig.attendance_records = {
      single: { clock_in_at: "2026-08-12T04:00:00Z", clock_out_at: null },
    };
    tableConfig.leave_policies = {
      rows: [
        { id: "p1", type: "paid", days_per_year: 18 },
        { id: "p2", type: "sick", days_per_year: 8 },
      ],
    };
    tableConfig.leave_requests = {
      rows: [
        { policy_id: "p1", leave_type: "paid", status: "approved", start_date: "2026-08-01", days: 3 },
        { policy_id: "p2", leave_type: "sick", status: "pending", start_date: "2026-07-20", days: 1 },
        { policy_id: "p1", leave_type: "paid", status: "approved", start_date: "2025-06-01", days: 5 },
      ],
    };

    const res = await call();
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toMatchObject({
      id: "emp-target",
      name: "Priya Shah",
      role: "employee",
      department: "Engineering",
      phone: "+919000000001",
      personalEmail: "priya@gmail.com",
      whatsappOptIn: true,
      todayAttendance: { status: "clocked_in", clockIn: "2026-08-12T04:00:00Z", clockOut: null },
    });
    expect(json.leaveBalance).toEqual(
      expect.arrayContaining([
        { type: "paid", remaining: 15 },
        { type: "sick", remaining: 8 },
      ]),
    );
    expect(json.recentRequests).toEqual([
      { type: "paid", status: "approved", when: "2026-08-01" },
      { type: "sick", status: "pending", when: "2026-07-20" },
      { type: "paid", status: "approved", when: "2025-06-01" },
    ]);

    const body = JSON.stringify(json).toLowerCase();
    expect(body).not.toContain("salary");
    expect(body).not.toContain("ctc");
    expect(body).not.toContain("pan_number");
    expect(body).not.toContain("aadhar");
    expect(body).not.toContain("bank");
    const keys = Object.keys(json);
    expect(keys).not.toContain("salary");
    expect(keys).not.toContain("panNumber");
    expect(keys).not.toContain("aadharNumber");
  });

  it("todayAttendance is null when there's no attendance row today", async () => {
    tableConfig.attendance_records = { single: null };
    const res = await call();
    const json = await res.json();
    expect(json.todayAttendance).toBeNull();
  });

  it("todayAttendance is clocked_out once both punches exist", async () => {
    tableConfig.attendance_records = {
      single: { clock_in_at: "2026-08-12T04:00:00Z", clock_out_at: "2026-08-12T13:00:00Z" },
    };
    const res = await call();
    const json = await res.json();
    expect(json.todayAttendance).toEqual({
      status: "clocked_out",
      clockIn: "2026-08-12T04:00:00Z",
      clockOut: "2026-08-12T13:00:00Z",
    });
  });
});
