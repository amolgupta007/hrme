import { describe, expect, it } from "vitest";
import { computeLeadScope } from "@/lib/geo/lead-scope";

describe("computeLeadScope", () => {
  it("admin: returns null (= no filter)", () => {
    expect(
      computeLeadScope({ role: "admin", employeeId: "e1" }, { dept: [] }),
    ).toBeNull();
  });

  it("owner: returns null", () => {
    expect(
      computeLeadScope({ role: "owner", employeeId: "e1" }, { dept: [] }),
    ).toBeNull();
  });

  it("manager: returns dept members + unassigned pool", () => {
    expect(
      computeLeadScope({ role: "manager", employeeId: "mgr1" }, { dept: ["e1", "e2"] }),
    ).toEqual({ inAssignedTo: ["e1", "e2"], includeUnassigned: true });
  });

  it("employee: returns just self, no unassigned pool", () => {
    expect(
      computeLeadScope({ role: "employee", employeeId: "e7" }, { dept: [] }),
    ).toEqual({ inAssignedTo: ["e7"], includeUnassigned: false });
  });
});
