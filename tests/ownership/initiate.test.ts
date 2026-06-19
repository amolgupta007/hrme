import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
vi.mock("@/lib/current-user", () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } }, FROM_EMAIL: "f@x", NOREPLY_EMAIL_FROM: "n@x" }));
vi.mock("@react-email/render", () => ({ render: vi.fn().mockResolvedValue("<html/>") }));
vi.mock("@/components/emails/ownership-transfer", () => ({ OwnershipTransferEmail: () => null }));

// Chainable supabase stub: each table call returns a builder; tests set outcomes per table.
let tables: Record<string, any>;
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({
    from: (name: string) => tables[name],
  }),
}));

import { initiateOwnershipTransfer } from "../../src/actions/ownership";

function builder(result: any) {
  const b: any = {};
  for (const m of ["select", "eq", "neq", "ilike", "insert", "update", "delete"]) b[m] = () => b;
  b.maybeSingle = () => Promise.resolve(result.maybeSingle ?? { data: null });
  b.single = () => Promise.resolve(result.single ?? { data: null, error: null });
  return b;
}

beforeEach(() => {
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ orgId: "org1", employeeId: "emp1", role: "owner" });
});

describe("initiateOwnershipTransfer", () => {
  it("blocks non-owner", async () => {
    getCurrentUser.mockResolvedValue({ orgId: "org1", employeeId: "emp1", role: "admin" });
    const res = await initiateOwnershipTransfer({ email: "jane@co.com" });
    expect(res.success).toBe(false);
  });

  it("blocks self-transfer", async () => {
    tables = {
      employees: builder({ single: { data: { id: "emp1", email: "me@co.com", phone: null, first_name: "Me" } } }),
    };
    const res = await initiateOwnershipTransfer({ email: "ME@CO.COM" });
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/yourself/i);
  });

  it("blocks a second pending transfer", async () => {
    tables = {
      employees: builder({ single: { data: { id: "emp1", email: "me@co.com", phone: null, first_name: "Me" } } }),
      ownership_transfers: builder({ maybeSingle: { data: { id: "t-existing" } } }),
    };
    const res = await initiateOwnershipTransfer({ email: "jane@co.com" });
    expect(res.success).toBe(false);
    expect((res as any).error).toMatch(/already pending/i);
  });
});
