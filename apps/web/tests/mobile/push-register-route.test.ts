import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mutable mock state ────────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;

const upsertCalls: Array<{ table: string; payload: any; opts: any }> = [];
const deleteCalls: Array<{ table: string; eqCalls: Array<[string, any]> }> = [];

function makeChain(table: string) {
  const eqCalls: Array<[string, any]> = [];
  const chain: any = {
    upsert: (payload: any, opts: any) => {
      upsertCalls.push({ table, payload, opts });
      return Promise.resolve({ data: null, error: null });
    },
    delete: () => chain,
    eq: (col: string, val: any) => {
      eqCalls.push([col, val]);
      return chain;
    },
    then: (resolve: (v: any) => any) => {
      deleteCalls.push({ table, eqCalls: [...eqCalls] });
      return resolve({ data: null, error: null });
    },
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

import { POST as registerPOST } from "@/app/api/mobile/push/register/route";
import { POST as unregisterPOST } from "@/app/api/mobile/push/unregister/route";

function post(url: string, bodyObj: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(bodyObj) }) as any;
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
  upsertCalls.length = 0;
  deleteCalls.length = 0;
});

// ── shared auth contract ──────────────────────────────────────────────────────
const routes = [
  {
    name: "POST /push/register",
    call: () =>
      registerPOST(
        post("http://localhost/api/mobile/push/register", {
          expoPushToken: "ExponentPushToken[abc]",
          platform: "ios",
        }),
      ),
  },
  {
    name: "POST /push/unregister",
    call: () =>
      unregisterPOST(
        post("http://localhost/api/mobile/push/unregister", {
          expoPushToken: "ExponentPushToken[abc]",
        }),
      ),
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
    it("403 no_employee when the membership has no employee row", async () => {
      currentUser = { ...EMPLOYEE, employeeId: null };
      const res = await r.call();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("no_employee");
    });
  });
}

// ── POST /api/mobile/push/register ────────────────────────────────────────────
describe("POST /api/mobile/push/register", () => {
  it("400 on an invalid body (missing platform)", async () => {
    const res = await registerPOST(
      post("http://localhost/api/mobile/push/register", { expoPushToken: "tok" }),
    );
    expect(res.status).toBe(400);
    expect(upsertCalls).toHaveLength(0);
  });

  it("400 on an unknown platform value", async () => {
    const res = await registerPOST(
      post("http://localhost/api/mobile/push/register", { expoPushToken: "tok", platform: "web" }),
    );
    expect(res.status).toBe(400);
    expect(upsertCalls).toHaveLength(0);
  });

  it("upserts push_tokens on expo_push_token with org/employee/clerk stamped", async () => {
    const res = await registerPOST(
      post("http://localhost/api/mobile/push/register", {
        expoPushToken: "ExponentPushToken[abc]",
        platform: "ios",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].table).toBe("push_tokens");
    expect(upsertCalls[0].payload).toMatchObject({
      org_id: "org-1",
      employee_id: "emp-1",
      clerk_user_id: "clerk_1",
      expo_push_token: "ExponentPushToken[abc]",
      platform: "ios",
    });
    expect(typeof upsertCalls[0].payload.last_seen_at).toBe("string");
    expect(upsertCalls[0].opts).toEqual({ onConflict: "expo_push_token" });
  });
});

// ── POST /api/mobile/push/unregister ──────────────────────────────────────────
describe("POST /api/mobile/push/unregister", () => {
  it("400 on an invalid body (empty token)", async () => {
    const res = await unregisterPOST(
      post("http://localhost/api/mobile/push/unregister", { expoPushToken: "" }),
    );
    expect(res.status).toBe(400);
    expect(deleteCalls).toHaveLength(0);
  });

  it("deletes only the caller's own row, self-scoped by org+employee+token", async () => {
    const res = await unregisterPOST(
      post("http://localhost/api/mobile/push/unregister", {
        expoPushToken: "ExponentPushToken[abc]",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe("push_tokens");
    expect(deleteCalls[0].eqCalls).toEqual([
      ["expo_push_token", "ExponentPushToken[abc]"],
      ["org_id", "org-1"],
      ["employee_id", "emp-1"],
    ]);
  });
});
