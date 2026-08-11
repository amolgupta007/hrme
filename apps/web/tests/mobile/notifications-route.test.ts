import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

const tableConfig: Record<string, { rows?: any[]; count?: number; error?: any }> = {};
const calls: Array<{ method: string; args: any[] }> = [];
let updatePayloads: any[] = [];

function resetTableConfig() {
  tableConfig.notifications = {
    rows: [
      {
        id: "n1",
        type: "leave_decision",
        title: "Leave approved",
        body: "Your leave request has been approved.",
        data: {},
        read_at: null,
        created_at: "2026-08-11T10:00:00.000Z",
      },
      {
        id: "n2",
        type: "payslip_paid",
        title: "Payslip ready",
        body: "Your payslip for August 2026 is ready to view.",
        data: { month: "2026-08" },
        read_at: "2026-08-10T08:00:00.000Z",
        created_at: "2026-08-10T09:00:00.000Z",
      },
    ],
    count: 3,
  };
}

// Single chain per `.from()` call. The route runs two queries against the
// SAME "notifications" table (list + unread count) — both read from the same
// tableConfig row, so `.data` (list) and `.count` (unreadCount) are both
// available regardless of which query resolves the chain.
function makeChain(table: string) {
  const cfg = tableConfig[table] ?? {};
  const awaitResult = {
    data: cfg.rows ?? [],
    count: cfg.count ?? (cfg.rows ? cfg.rows.length : 0),
    error: cfg.error ?? null,
  };
  const chain: any = {
    select: () => chain,
    eq: (...args: any[]) => {
      calls.push({ method: "eq", args });
      return chain;
    },
    neq: () => chain,
    lt: (...args: any[]) => {
      calls.push({ method: "lt", args });
      return chain;
    },
    is: (...args: any[]) => {
      calls.push({ method: "is", args });
      return chain;
    },
    in: (...args: any[]) => {
      calls.push({ method: "in", args });
      return chain;
    },
    order: () => chain,
    limit: (...args: any[]) => {
      calls.push({ method: "limit", args });
      return chain;
    },
    update: (payload: any) => {
      updatePayloads.push(payload);
      return chain;
    },
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));

import { GET as notificationsGET } from "@/app/api/mobile/notifications/route";
import { POST as readPOST } from "@/app/api/mobile/notifications/read/route";

function req(url = "http://localhost/api/mobile/notifications", init?: RequestInit) {
  return new Request(url, init) as any;
}
function post(url: string, bodyObj: unknown) {
  return req(url, { method: "POST", body: JSON.stringify(bodyObj) });
}

const EMPLOYEE = {
  orgId: "org-1",
  orgName: "Acme",
  role: "employee",
  plan: "business",
  employeeId: "emp-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = { ...EMPLOYEE };
  calls.length = 0;
  updatePayloads = [];
  resetTableConfig();
});

// ── shared auth contract ──────────────────────────────────────────────────────
const routes = [
  { name: "GET /notifications", call: () => notificationsGET(req()) },
  {
    name: "POST /notifications/read",
    call: () =>
      readPOST(post("http://localhost/api/mobile/notifications/read", { all: true })),
  },
];
for (const r of routes) {
  describe(`${r.name} auth`, () => {
    it("401 unauthenticated with no Clerk session", async () => {
      clerkUserId = null;
      const res = await r.call();
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe("unauthenticated");
    });
    it("403 no_membership when the user has no org membership", async () => {
      currentUser = null;
      const res = await r.call();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("no_membership");
    });
  });
}

// ── GET /api/mobile/notifications ─────────────────────────────────────────────
describe("GET /api/mobile/notifications (200)", () => {
  it("returns the self-scoped list + unreadCount", async () => {
    const res = await notificationsGET(req());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notifications).toHaveLength(2);
    expect(json.notifications[0]).toMatchObject({
      id: "n1",
      type: "leave_decision",
      title: "Leave approved",
      readAt: null,
    });
    expect(json.notifications[1].readAt).toBe("2026-08-10T08:00:00.000Z");
    expect(json.unreadCount).toBe(3);
    expect(json.nextCursor).toBeNull(); // 2 rows < PAGE_SIZE(30)
  });

  it("applies the unread=1 filter to the list query (not just the count query)", async () => {
    await notificationsGET(req("http://localhost/api/mobile/notifications?unread=1"));
    const isCalls = calls.filter((c) => c.method === "is");
    // one for the list query's unread filter, one for the always-on unreadCount query
    expect(isCalls.length).toBe(2);
  });

  it("omits the unread filter from the list query when unread is not set", async () => {
    await notificationsGET(req());
    const isCalls = calls.filter((c) => c.method === "is");
    // only the always-on unreadCount query filters read_at
    expect(isCalls.length).toBe(1);
  });

  it("passes the cursor through as a created_at lt() filter", async () => {
    await notificationsGET(
      req("http://localhost/api/mobile/notifications?cursor=2026-08-10T09:00:00.000Z"),
    );
    const ltCalls = calls.filter((c) => c.method === "lt");
    expect(ltCalls).toHaveLength(1);
    expect(ltCalls[0].args).toEqual(["created_at", "2026-08-10T09:00:00.000Z"]);
  });
});

// ── POST /api/mobile/notifications/read ───────────────────────────────────────
describe("POST /api/mobile/notifications/read", () => {
  it("rejects an empty body with 400 (neither ids nor all)", async () => {
    const res = await readPOST(post("http://localhost/api/mobile/notifications/read", {}));
    expect(res.status).toBe(400);
    expect(updatePayloads).toHaveLength(0);
  });

  it("marks all self rows read when {all:true}", async () => {
    const res = await readPOST(
      post("http://localhost/api/mobile/notifications/read", { all: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toHaveProperty("read_at");
    // self-scope applied, but no id-list restriction on the "all" path
    expect(calls.some((c) => c.method === "in")).toBe(false);
    expect(calls).toContainEqual({ method: "eq", args: ["org_id", "org-1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["employee_id", "emp-1"] });
  });

  it("marks only the given ids when {ids:[...]}", async () => {
    const id = "b3f1c2de-0000-4000-8000-000000000001";
    const res = await readPOST(
      post("http://localhost/api/mobile/notifications/read", { ids: [id] }),
    );
    expect(res.status).toBe(200);
    const inCall = calls.find((c) => c.method === "in");
    expect(inCall?.args).toEqual(["id", [id]]);
  });

  it("403 no_employee when the membership has no employee row", async () => {
    currentUser = { ...EMPLOYEE, employeeId: null };
    const res = await readPOST(
      post("http://localhost/api/mobile/notifications/read", { all: true }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("no_employee");
  });
});
