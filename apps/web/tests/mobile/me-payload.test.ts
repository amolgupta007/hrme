import { describe, expect, it } from "vitest";
import { buildMePayload } from "@/lib/mobile/me-payload";

const user = {
  orgId: "org-1",
  orgName: "Acme",
  role: "employee" as const,
  plan: "business" as const,
};

const employeeRow = {
  id: "emp-1",
  first_name: "Priya",
  last_name: "Sharma",
  email: "priya@acme.in",
  phone: "+919812345678",
  employment_type: "full_time",
};

const membershipRows = [
  { org_id: "org-1", role: "employee", organizations: { id: "org-1", name: "Acme" } },
  { org_id: "org-2", role: "owner", organizations: { id: "org-2", name: null } },
];

describe("buildMePayload", () => {
  it("maps snake_case rows to the MobileMeResponse contract", () => {
    const payload = buildMePayload(user, employeeRow, membershipRows);
    expect(payload).toEqual({
      orgId: "org-1",
      orgName: "Acme",
      role: "employee",
      plan: "business",
      employee: {
        id: "emp-1",
        firstName: "Priya",
        lastName: "Sharma",
        email: "priya@acme.in",
        phone: "+919812345678",
        employmentType: "full_time",
      },
      memberships: [
        { orgId: "org-1", orgName: "Acme", role: "employee" },
        { orgId: "org-2", orgName: "your organisation", role: "owner" },
      ],
    });
  });

  it("passes a null employee through", () => {
    expect(buildMePayload(user, null, membershipRows).employee).toBeNull();
  });

  it("preserves membership order (oldest first, as queried)", () => {
    const payload = buildMePayload(user, null, [...membershipRows].reverse());
    expect(payload.memberships.map((m) => m.orgId)).toEqual(["org-2", "org-1"]);
  });
});
