import { describe, it, expect } from "vitest";
import { resolveCoveredEmployeeIds } from "@/lib/attendance/late-policy-targets";

const employees = [
  { id: "e1", department_id: "d1" },
  { id: "e2", department_id: "d1" },
  { id: "e3", department_id: "d2" },
  { id: "e4", department_id: null },
];

describe("resolveCoveredEmployeeIds", () => {
  it("covers all employees in a targeted department", () => {
    const s = resolveCoveredEmployeeIds({ targets: [{ target_type: "department", target_id: "d1" }], employees });
    expect([...s].sort()).toEqual(["e1", "e2"]);
  });
  it("unions department + individual employee targets", () => {
    const s = resolveCoveredEmployeeIds({
      targets: [
        { target_type: "department", target_id: "d1" },
        { target_type: "employee", target_id: "e3" },
      ],
      employees,
    });
    expect([...s].sort()).toEqual(["e1", "e2", "e3"]);
  });
  it("returns empty set for empty targets", () => {
    expect(resolveCoveredEmployeeIds({ targets: [], employees }).size).toBe(0);
  });
});
