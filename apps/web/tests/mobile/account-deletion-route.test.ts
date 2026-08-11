import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

// Per-table canned results. `single` serves maybeSingle()/single(); `rows` an
// awaited (thenable) chain; `insertResult`/`insertError` the insert().select().single().
const tableConfig: Record<
  string,
  { single?: any; rows?: any[]; insertResult?: any; insertError?: any }
> = {};
let insertCalls: Array<[string, any]> = [];
const sentEmails: any[] = [];

function resetTableConfig() {
  // No existing pending request; a fresh insert yields this requested_at.
  tableConfig.account_deletion_requests = {
    single: null,
    insertResult: { requested_at: "2026-08-11T08:00:00.000Z" },
  };
  // Admin recipients + requester name for notifyAdmins.
  tableConfig.employees = {
    rows: [{ email: "admin@acme.test" }, { email: "owner@acme.test" }],
    single: { first_name: "Ravi", last_name: "Kumar" },
  };
}

function makeChain(table: string) {
  const cfg = (tableConfig[table] ??= {});
  const awaitResult = { data: cfg.rows ?? [], error: null };
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    order: () => chain,
    insert: (payload: any) => {
      insertCalls.push([table, payload]);
      // Model the DB: after a successful insert, subsequent pre-check reads on
      // this table find the row — so a second POST is idempotent.
      if (!cfg.insertError) cfg.single = cfg.insertResult;
      return {
        select: () => ({
          single: () =>
            Promise.resolve({ data: cfg.insertResult ?? null, error: cfg.insertError ?? null }),
        }),
      };
    },
    maybeSingle: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    single: () => Promise.resolve({ data: cfg.single ?? null, error: null }),
    then: (resolve: (v: any) => any) => resolve(awaitResult),
  };
  return chain;
}

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@react-email/render", () => ({ render: vi.fn(async () => "<html></html>") }));
vi.mock("@/components/emails/account-deletion-request", () => ({
  AccountDeletionRequestEmail: () => null,
}));
vi.mock("@/lib/resend", () => ({
  resend: {
    emails: {
      send: vi.fn(async (args: any) => {
        sentEmails.push(args);
        return { data: {}, error: null };
      }),
    },
  },
  FROM_EMAIL: "support@jambahr.com",
}));

import { POST, GET } from "@/app/api/mobile/account/deletion-request/route";

function req(url = "http://localhost/api/mobile/account/deletion-request", init?: RequestInit) {
  return new Request(url, init) as any;
}
function post(bodyObj?: unknown) {
  return req("http://localhost/api/mobile/account/deletion-request", {
    method: "POST",
    body: JSON.stringify(bodyObj ?? {}),
  });
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
  insertCalls = [];
  sentEmails.length = 0;
  resetTableConfig();
});

// ── shared auth contract (POST + GET) ─────────────────────────────────────────
const routes = [
  { name: "POST", call: () => POST(post()) },
  { name: "GET", call: () => GET(req()) },
];
for (const r of routes) {
  describe(`${r.name} /account/deletion-request auth`, () => {
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
    it("403 no_employee when the membership has no employee row", async () => {
      currentUser = { ...EMPLOYEE, employeeId: null };
      const res = await r.call();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("no_employee");
    });
  });
}

// ── POST success ──────────────────────────────────────────────────────────────
describe("POST /account/deletion-request (success)", () => {
  it("inserts a pending request for self and returns {status,requestedAt}", async () => {
    const res = await POST(post({ reason: "Leaving the company" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "pending",
      requestedAt: "2026-08-11T08:00:00.000Z",
    });
    // exactly one insert, scoped to the caller, storing the reason as note
    const adrInserts = insertCalls.filter(([t]) => t === "account_deletion_requests");
    expect(adrInserts).toHaveLength(1);
    expect(adrInserts[0][1]).toMatchObject({
      org_id: "org-1",
      employee_id: "emp-1",
      status: "pending",
      note: "Leaving the company",
    });
    // admins were notified (best-effort email fired)
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toEqual(["admin@acme.test", "owner@acme.test"]);
  });

  it("stores note as null when no reason is provided", async () => {
    await POST(post({}));
    const adrInserts = insertCalls.filter(([t]) => t === "account_deletion_requests");
    expect(adrInserts[0][1].note).toBeNull();
  });

  it("rejects a reason over 500 chars with 400 (no insert)", async () => {
    const res = await POST(post({ reason: "x".repeat(501) }));
    expect(res.status).toBe(400);
    expect(insertCalls.filter(([t]) => t === "account_deletion_requests")).toHaveLength(0);
  });
});

// ── POST idempotent ───────────────────────────────────────────────────────────
describe("POST /account/deletion-request (idempotent)", () => {
  it("a second request does not duplicate — still one pending, success", async () => {
    const first = await POST(post());
    expect(first.status).toBe(200);
    const second = await POST(post());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({
      status: "pending",
      requestedAt: "2026-08-11T08:00:00.000Z",
    });
    // only the FIRST call inserted + emailed
    expect(insertCalls.filter(([t]) => t === "account_deletion_requests")).toHaveLength(1);
    expect(sentEmails).toHaveLength(1);
  });
});

// ── GET ───────────────────────────────────────────────────────────────────────
describe("GET /account/deletion-request", () => {
  it("returns null when there is no pending request", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ request: null });
  });

  it("returns the pending request when one exists", async () => {
    tableConfig.account_deletion_requests = {
      single: { requested_at: "2026-08-11T08:00:00.000Z" },
    };
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      request: { status: "pending", requestedAt: "2026-08-11T08:00:00.000Z" },
    });
  });
});
