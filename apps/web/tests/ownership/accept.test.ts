import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: "clerk_jane" }),
  clerkClient: async () => ({
    users: {
      getUser: async () => ({
        primaryEmailAddress: { emailAddress: "jane@co.com" },
        emailAddresses: [],
        phoneNumbers: [],
      }),
    },
  }),
}));
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: vi.fn() } },
  FROM_EMAIL: "f@x",
  NOREPLY_EMAIL_FROM: "n@x",
}));
vi.mock("@react-email/render", () => ({ render: vi.fn().mockResolvedValue("<html/>") }));
vi.mock("@/components/emails/ownership-transfer", () => ({ OwnershipTransferEmail: () => null }));
vi.mock("@/components/emails/ownership-transferred", () => ({ OwnershipTransferredEmail: () => null }));
vi.mock("@/lib/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Track all update calls for assertions
const updates: { table: string; payload: any; id: any }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (table: string) => makeTableProxy(table),
  }),
}));

function makeTableProxy(table: string) {
  const b: any = {};
  const eq_state: Record<string, any> = {};

  b.select = () => b;

  b.eq = (k: string, v: any) => {
    eq_state[k] = v;
    // The current-owners query: .select(...).eq("org_id", orgId).eq("role", "owner")
    // When table is "employees" and we're filtering by role=owner, return the owners list Promise
    if (table === "employees" && k === "role" && v === "owner") {
      return Promise.resolve({ data: [{ id: "empOld", email: "old@co.com", first_name: "Old" }] });
    }
    return b;
  };

  b.update = (payload: any) => ({
    eq: (k: string, id: any) => {
      updates.push({ table, payload, id });
      return Promise.resolve({ error: null });
    },
  });

  b.maybeSingle = () => {
    if (table === "ownership_transfers") {
      return Promise.resolve({
        data: {
          id: "t1",
          org_id: "org1",
          to_employee_id: "empJane",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
          to_email: "jane@co.com",
          to_phone: null,
        },
      });
    }
    return Promise.resolve({ data: null });
  };

  b.single = () => {
    if (table === "organizations") return Promise.resolve({ data: { name: "Acme" } });
    if (table === "employees") return Promise.resolve({ data: { first_name: "Jane", id: "empJane" } });
    return Promise.resolve({ data: null });
  };

  return b;
}

import { acceptOwnershipTransfer } from "../../src/actions/ownership";

beforeEach(() => {
  updates.length = 0;
});

describe("acceptOwnershipTransfer", () => {
  it("promotes invitee to owner, demotes current owner, stamps legal, marks accepted", async () => {
    const res = await acceptOwnershipTransfer("tok");
    expect(res.success).toBe(true);

    // old owner demoted to admin
    expect(updates).toContainEqual(
      expect.objectContaining({ table: "employees", payload: { role: "admin" }, id: "empOld" })
    );
    // invitee promoted to owner
    expect(updates).toContainEqual(
      expect.objectContaining({ table: "employees", payload: { role: "owner" }, id: "empJane" })
    );
    // org legal re-stamped with policy version
    const orgUpdate = updates.find((u) => u.table === "organizations");
    expect(orgUpdate?.payload.policy_version_accepted).toBeTruthy();
    expect(orgUpdate?.payload.terms_accepted_at).toBeTruthy();
    expect(orgUpdate?.payload.privacy_policy_accepted_at).toBeTruthy();
    // transfer marked accepted
    const transferUpdate = updates.find((u) => u.table === "ownership_transfers");
    expect(transferUpdate?.payload.status).toBe("accepted");
  });
});
