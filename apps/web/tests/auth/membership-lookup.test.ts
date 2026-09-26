import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression guard for the 2026-09-26 outage.
 *
 * When Supabase was unreachable, `loadMemberships()` inside getCurrentUser
 * discarded the query `error` and read `data` as `null`, so "the database did
 * not answer" was indistinguishable from "this account belongs to no org".
 * Every signed-in user — owners included — was bounced to /onboarding and told
 * "No workspace found for this account", i.e. the app reported permanent data
 * loss for a transient outage.
 *
 * A failed lookup must fail LOUDLY (throw), and only a genuinely empty result
 * may return null.
 */

vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "clerk_1" }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({
        primaryEmailAddress: null,
        emailAddresses: [],
        primaryPhoneNumber: null,
        phoneNumbers: [],
      }),
    },
  }),
}));

const state: { result: { data: any; error: any } } = {
  result: { data: [], error: null },
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: () => makeBuilder() }),
}));

function makeBuilder() {
  const b: any = {};
  b.select = () => b;
  b.update = () => b;
  b.eq = () => b;
  b.neq = () => b;
  b.is = () => b;
  b.limit = () => b;
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  // Both getCurrentUser's loadMemberships() and getOrgContext() terminate the
  // chain on .order(), so that is where the awaited result is handed back.
  b.order = () => Promise.resolve(state.result);
  return b;
}

const ORG = {
  id: "org-1",
  name: "Acme",
  plan: "growth",
  settings: {},
  custom_features: null,
};

const MEMBERSHIP_ROW = {
  id: "emp-1",
  role: "owner",
  first_name: "Amol",
  employment_type: "full_time",
  org_id: "org-1",
  organizations: ORG,
};

import {
  getCurrentUser,
  getOrgContext,
  MembershipLookupError,
  isMembershipLookupError,
} from "@/lib/current-user";

describe("membership lookup failure vs. empty result", () => {
  beforeEach(() => {
    state.result = { data: [], error: null };
  });

  it("getCurrentUser THROWS when the membership query fails", async () => {
    state.result = {
      data: null,
      error: { message: "canceling statement due to statement timeout" },
    };

    await expect(getCurrentUser()).rejects.toBeInstanceOf(MembershipLookupError);
  });

  it("getCurrentUser keeps the query error as the cause, for Sentry", async () => {
    const error = { message: "fetch failed", code: "522" };
    state.result = { data: null, error };

    const thrown = await getCurrentUser().then(
      () => null,
      (e) => e,
    );
    expect(isMembershipLookupError(thrown)).toBe(true);
    expect((thrown as MembershipLookupError).cause).toBe(error);
  });

  it("getCurrentUser still returns null for a genuinely org-less account", async () => {
    state.result = { data: [], error: null };

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("getCurrentUser resolves a real membership unchanged", async () => {
    state.result = { data: [MEMBERSHIP_ROW], error: null };

    const user = await getCurrentUser();
    expect(user?.orgId).toBe("org-1");
    expect(user?.role).toBe("owner");
    expect(user?.employeeId).toBe("emp-1");
  });

  it("getOrgContext THROWS when the membership query fails", async () => {
    state.result = { data: null, error: { message: "connection refused" } };

    await expect(getOrgContext()).rejects.toBeInstanceOf(MembershipLookupError);
  });

  it("getOrgContext still returns null for a genuinely org-less account", async () => {
    state.result = { data: [], error: null };

    await expect(getOrgContext()).resolves.toBeNull();
  });

  it("isMembershipLookupError rejects unrelated errors", () => {
    expect(isMembershipLookupError(new Error("nope"))).toBe(false);
    expect(isMembershipLookupError(null)).toBe(false);
    expect(isMembershipLookupError("no workspace")).toBe(false);
  });
});
