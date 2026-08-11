import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Module mocks -------------------------------------------------------
// requestLeave is a "use server" action that reaches Clerk auth, the
// current-user resolver, and the admin Supabase client. This is a lean,
// purpose-built proxy — not a general Supabase mock — scoped to exactly the
// query shapes requestLeave issues, so it stays cheap to maintain. See
// tests/ownership/accept.test.ts for the precedent this borrows from.

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "clerk_1" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const EMP_ID = "11111111-1111-4111-8111-111111111111";
const POLICY_ID = "22222222-2222-4222-8222-222222222222";

const mockUser = {
  orgId: "org1",
  orgName: "Acme",
  clerkUserId: "clerk_1",
  role: "employee" as const,
  employeeId: EMP_ID,
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

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => mockUser),
  // Real semantics reimplemented inline (pure, tiny) rather than importing
  // the real module — avoids dragging in next/headers at import time.
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => role === "owner" || role === "admin" || role === "manager",
}));

// Policy type is swapped per-test via this mutable box so the proxy factory
// (defined once) can vary its response.
const state: { policyType: "unpaid" | "paid" | "casual" | "sick"; insertedPayload: any } = {
  policyType: "unpaid",
  insertedPayload: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => makeTableProxy(table),
  }),
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

  b.single = () => {
    if (table === "employees") {
      // Both the target-employee scope lookup and the email requester
      // lookup select overlapping columns off the same row shape.
      return Promise.resolve({
        data: {
          id: EMP_ID,
          first_name: "Priya",
          last_name: "S",
          reporting_manager_id: null,
          reporting_manager_2_id: null,
        },
      });
    }
    if (table === "leave_policies") {
      if (selectedCols.includes("days_per_year")) {
        return Promise.resolve({ data: { type: state.policyType, days_per_year: 21 } });
      }
      return Promise.resolve({ data: { name: "Casual Leave" } });
    }
    if (table === "leave_requests") {
      // insert(...).select("id").single()
      return Promise.resolve({ data: { id: "req1" }, error: null });
    }
    return Promise.resolve({ data: null });
  };

  b.insert = (payload: any) => {
    state.insertedPayload = payload;
    return b; // chained .select("id").single()
  };

  // Plain-await terminal for chains that never call .single() — the active
  // leave_requests lookup and the managers-email-recipient lookup.
  b.then = (resolve: any, reject: any) => {
    return Promise.resolve({ data: [] }).then(resolve, reject);
  };

  return b;
}

import { requestLeave } from "../../src/actions/leaves";

beforeEach(() => {
  state.policyType = "unpaid";
  state.insertedPayload = null;
});

const baseForm = {
  employeeId: EMP_ID,
  policyId: POLICY_ID,
  reason: "personal",
};

describe("requestLeave — half-day flags", () => {
  it("derives days=0.5 server-side for a single-day half-day-start request and persists both flags + the derived days (unpaid, LOP-relevant path)", async () => {
    const res = await requestLeave({
      ...baseForm,
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      days: 1, // client-sent value is ignored once a half-day flag is set
      startHalfDay: true,
      endHalfDay: false,
    } as any);

    expect(res.success).toBe(true);
    expect(state.insertedPayload).toMatchObject({
      days: 0.5,
      start_half_day: true,
      end_half_day: false,
    });
  });

  it("derives days=4.0 for a 5-day range with both half-day flags set", async () => {
    const res = await requestLeave({
      ...baseForm,
      startDate: "2026-08-10",
      endDate: "2026-08-14",
      days: 99, // ignored — must not leak through when flags are set
      startHalfDay: true,
      endHalfDay: true,
    } as any);

    expect(res.success).toBe(true);
    expect(state.insertedPayload).toMatchObject({
      days: 4,
      start_half_day: true,
      end_half_day: true,
    });
  });

  it("rejects a same-day request with both half-day flags (derived days <= 0) before touching the insert", async () => {
    const res = await requestLeave({
      ...baseForm,
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      days: 1,
      startHalfDay: true,
      endHalfDay: true,
    } as any);

    expect(res).toEqual({ success: false, error: "Leave must be at least half a day" });
    expect(state.insertedPayload).toBeNull();
  });

  it("web path is byte-identical: with both flags false (or omitted), the client-sent days is used as-is and persisted flags are false", async () => {
    const res = await requestLeave({
      ...baseForm,
      startDate: "2026-08-10",
      endDate: "2026-08-12",
      days: 3,
      // startHalfDay / endHalfDay omitted — schema defaults both to false,
      // matching every existing web call site that never sends these keys.
    } as any);

    expect(res.success).toBe(true);
    expect(state.insertedPayload).toMatchObject({
      days: 3,
      start_half_day: false,
      end_half_day: false,
    });
  });
});
