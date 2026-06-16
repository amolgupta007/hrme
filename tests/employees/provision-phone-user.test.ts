import { describe, it, expect, vi } from "vitest";
import { provisionPhoneOnlyUser } from "@/lib/clerk/provision-phone-user";

function makeClient(overrides: any = {}) {
  return {
    users: {
      getUserList: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
      createUser: vi.fn().mockResolvedValue({ id: "user_new" }),
      ...overrides.users,
    },
    organizations: {
      createOrganizationMembership: vi.fn().mockResolvedValue({ id: "mem_1" }),
      ...overrides.organizations,
    },
  };
}

describe("provisionPhoneOnlyUser", () => {
  it("creates a new Clerk user when none exists and adds org membership", async () => {
    const client = makeClient();
    const res = await provisionPhoneOnlyUser(client as any, {
      phoneE164: "+919876543210",
      clerkOrgId: "org_1",
      role: "employee",
    });
    expect(client.users.createUser).toHaveBeenCalledWith({
      phoneNumber: ["+919876543210"],
      skipPasswordRequirement: true,
    });
    expect(client.organizations.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_new",
      role: "org:member",
    });
    expect(res).toEqual({ clerkUserId: "user_new" });
  });

  it("reuses an existing Clerk user with that phone (multi-org case)", async () => {
    const client = makeClient({
      users: { getUserList: vi.fn().mockResolvedValue({ data: [{ id: "user_existing" }], totalCount: 1 }) },
    });
    const res = await provisionPhoneOnlyUser(client as any, {
      phoneE164: "+919876543210",
      clerkOrgId: "org_1",
      role: "admin",
    });
    expect(client.users.createUser).not.toHaveBeenCalled();
    expect(client.organizations.createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_1",
      userId: "user_existing",
      role: "org:admin",
    });
    expect(res).toEqual({ clerkUserId: "user_existing" });
  });

  it("maps owner/admin roles to org:admin, others to org:member", async () => {
    const client = makeClient();
    await provisionPhoneOnlyUser(client as any, { phoneE164: "+919876543210", clerkOrgId: "o", role: "owner" });
    expect(client.organizations.createOrganizationMembership).toHaveBeenCalledWith(
      expect.objectContaining({ role: "org:admin" })
    );
  });

  it("treats an already-a-member error as success", async () => {
    const client = makeClient({
      organizations: {
        createOrganizationMembership: vi
          .fn()
          .mockRejectedValue({ errors: [{ code: "already_a_member_of_organization" }] }),
      },
    });
    const res = await provisionPhoneOnlyUser(client as any, {
      phoneE164: "+919876543210",
      clerkOrgId: "org_1",
      role: "employee",
    });
    expect(res).toEqual({ clerkUserId: "user_new" });
  });
});
