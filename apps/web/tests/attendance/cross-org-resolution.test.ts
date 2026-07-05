import { describe, it, expect } from "vitest";
import { decideAttribution } from "@/lib/attendance/cross-org-resolution";

describe("decideAttribution", () => {
  it("host match wins (dual-employment safe)", () => {
    expect(decideAttribution({ employeeId: "H", orgId: "B" }, [{ employeeId: "G", orgId: "A" }]))
      .toEqual({ status: "host", employeeId: "H", orgId: "B" });
  });

  it("single group match → attributed to payroll org", () => {
    expect(decideAttribution(null, [{ employeeId: "G", orgId: "A" }]))
      .toEqual({ status: "attributed", employeeId: "G", payrollOrgId: "A" });
  });

  it("multiple group matches → ambiguous, never guess", () => {
    const r = decideAttribution(null, [
      { employeeId: "G1", orgId: "A" },
      { employeeId: "G2", orgId: "C" },
    ]);
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidateOrgIds.sort()).toEqual(["A", "C"]);
  });

  it("no match → unmatched", () => {
    expect(decideAttribution(null, [])).toEqual({ status: "unmatched" });
  });

  it("dedupes candidate org ids in ambiguity", () => {
    const r = decideAttribution(null, [
      { employeeId: "G1", orgId: "A" },
      { employeeId: "G2", orgId: "A" },
    ]);
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") expect(r.candidateOrgIds).toEqual(["A"]);
  });
});
