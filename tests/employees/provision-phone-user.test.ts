import { describe, it, expect, vi } from "vitest";
import { provisionPhoneOnlyUser } from "@/lib/clerk/provision-phone-user";

function makeClient(overrides: any = {}) {
  return {
    users: {
      getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
      createUser: vi.fn().mockResolvedValue({ id: "user_new" }),
      ...overrides.users,
    },
    organizations: { createOrganizationMembership: vi.fn(), updateOrganization: vi.fn() },
  };
}

describe("provisionPhoneOnlyUser", () => {
  it("creates a new Clerk user by phone and adds NO org membership", async () => {
    const client = makeClient();
    const res = await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", role: "employee" });
    expect(client.users.createUser).toHaveBeenCalledWith({ phoneNumber: ["+919876543210"], skipPasswordRequirement: true });
    expect(client.organizations.createOrganizationMembership).not.toHaveBeenCalled();
    expect(res).toEqual({ clerkUserId: "user_new" });
  });
  it("reuses an existing Clerk user with that phone", async () => {
    const client = makeClient({ users: { getUserList: vi.fn().mockResolvedValue({ data: [{ id: "user_existing" }], totalCount: 1 }) } });
    const res = await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", role: "admin" });
    expect(client.users.createUser).not.toHaveBeenCalled();
    expect(res).toEqual({ clerkUserId: "user_existing" });
  });
  it("warns but proceeds when multiple users match the phone", async () => {
    const client = makeClient({ users: { getUserList: vi.fn().mockResolvedValue({ data: [{ id: "u1" }, { id: "u2" }], totalCount: 2 }) } });
    const res = await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", role: "employee" });
    expect(res).toEqual({ clerkUserId: "u1" });
  });
});
