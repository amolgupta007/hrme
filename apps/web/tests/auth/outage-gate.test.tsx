import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * End-to-end proof of the 2026-09-26 fix at the two web auth gates.
 *
 * Deliberately does NOT mock `@/lib/current-user` — the real getCurrentUser
 * runs against a Supabase client whose query returns an error, so this
 * exercises the actual throw AND the actual try/catch in the page/layout.
 * A unit test of the resolver alone would not prove the gates catch it.
 */

const redirectMock = vi.hoisted(() => vi.fn((path: string) => {
  // next/navigation's redirect throws to unwind rendering; mimic that so a
  // test can never mistake "redirected" for "rendered".
  throw new Error(`REDIRECT:${path}`);
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "clerk_owner_1" }),
  currentUser: async () => ({
    primaryEmailAddress: { emailAddress: "amol@example.com" },
    emailAddresses: [{ emailAddress: "amol@example.com" }],
    primaryPhoneNumber: null,
    phoneNumbers: [],
  }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({
        primaryEmailAddress: { emailAddress: "amol@example.com" },
        emailAddresses: [{ emailAddress: "amol@example.com" }],
        primaryPhoneNumber: null,
        phoneNumbers: [],
      }),
    },
  }),
}));

const db: { result: { data: any; error: any } } = {
  result: { data: [], error: null },
};

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: () => builder() }),
  createServerSupabase: () => ({ from: () => builder() }),
}));

function builder() {
  const b: any = {};
  b.select = () => b;
  b.update = () => b;
  b.eq = () => b;
  b.neq = () => b;
  b.is = () => b;
  b.limit = () => b;
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
  b.order = () => Promise.resolve(db.result);
  return b;
}

vi.mock("@/components/layout/sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/components/feedback/report-feedback-trigger", () => ({
  ReportFeedbackTriggerRoot: ({ children }: any) => children,
}));
vi.mock("@/components/assistant/assistant-launcher", () => ({
  AssistantLauncher: () => null,
}));
vi.mock("@/actions/notifications", () => ({
  getPendingCounts: async () => ({}),
}));
vi.mock("@/actions/active-org", () => ({ getMyOrgs: async () => [] }));

import OnboardingPage from "@/app/onboarding/page";
import DashboardLayout from "@/app/dashboard/layout";
import { WorkspaceUnavailable } from "@/components/layout/workspace-unavailable";
import { OnboardingClient } from "@/app/onboarding/onboarding-client";

const DB_DOWN = {
  data: null,
  error: { message: "TypeError: fetch failed", code: "522" },
};

describe("/onboarding gate during a database outage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    db.result = { data: [], error: null };
  });

  it("renders WorkspaceUnavailable — NOT the 'no workspace found' wall", async () => {
    db.result = DB_DOWN;

    const element: any = await OnboardingPage();

    expect(element.type).toBe(WorkspaceUnavailable);
    expect(element.type).not.toBe(OnboardingClient);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("still shows the invite wall for a genuinely org-less account", async () => {
    db.result = { data: [], error: null };

    const element: any = await OnboardingPage();

    // The honest "no admin has added you yet" path must be untouched.
    expect(element.type).toBe(OnboardingClient);
    expect(element.props.signedInEmail).toBe("amol@example.com");
  });

  it("still redirects a real member to the dashboard", async () => {
    db.result = {
      data: [
        {
          id: "emp-1",
          role: "owner",
          first_name: "Amol",
          employment_type: "full_time",
          org_id: "org-1",
          organizations: {
            id: "org-1",
            name: "Acme",
            plan: "business",
            settings: {},
            custom_features: null,
          },
        },
      ],
      error: null,
    };

    await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/dashboard");
  });
});

describe("/dashboard gate during a database outage", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    db.result = { data: [], error: null };
  });

  it("renders WorkspaceUnavailable instead of bouncing to /onboarding", async () => {
    db.result = DB_DOWN;

    const element: any = await DashboardLayout({ children: null });

    expect(element.type).toBe(WorkspaceUnavailable);
    // The old behaviour: redirect("/onboarding") -> the "no workspace" wall.
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("still redirects a genuinely org-less account to /onboarding", async () => {
    db.result = { data: [], error: null };

    await expect(DashboardLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/onboarding"
    );
  });
});
