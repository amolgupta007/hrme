import { describe, expect, it } from "vitest";
import { buildSystemVisitForStageMove } from "@/actions/geo-leads";

describe("buildSystemVisitForStageMove", () => {
  const baseArgs = {
    leadId: "lead-1",
    orgId: "org-1",
    employeeId: "e-1",
    from: "new" as const,
    to: "contacted" as const,
    note: undefined,
  };

  it("returns null when from === to (no-op)", () => {
    expect(
      buildSystemVisitForStageMove({ ...baseArgs, from: "new", to: "new" }),
    ).toBeNull();
  });

  it("writes a system visit with outcome=in_progress for in-flight target", () => {
    const v = buildSystemVisitForStageMove(baseArgs);
    expect(v).toMatchObject({
      lead_id: "lead-1",
      org_id: "org-1",
      employee_id: "e-1",
      outcome: "in_progress",
      source: "web",
      system: true,
    });
    expect(v?.notes).toMatch(/Stage: new → contacted/);
  });

  it("writes outcome=converted when target is converted", () => {
    expect(
      buildSystemVisitForStageMove({ ...baseArgs, to: "converted" }),
    ).toMatchObject({ outcome: "converted" });
  });

  it("appends a user-supplied note", () => {
    const v = buildSystemVisitForStageMove({ ...baseArgs, note: "Customer asked for quote" });
    expect(v?.notes).toMatch(/Customer asked for quote/);
  });
});
