import { describe, it, expect } from "vitest";
import {
  toReportLeaveRows,
  buildLeaveReport,
} from "@/lib/mobile/reports-payload";

/**
 * `leave_requests` has no `leave_type` column — the type lives on
 * `leave_policies.type`, reached through `policy_id`. The report query
 * therefore embeds the policy, and this mapper flattens PostgREST's embedded
 * relation into the shape `buildLeaveReport` aggregates.
 */

describe("toReportLeaveRows", () => {
  it("reads the type out of the embedded policy", () => {
    expect(
      toReportLeaveRows([{ days: 2, leave_policies: { type: "casual" } }])
    ).toEqual([{ leave_type: "casual", days: 2 }]);
  });

  it("tolerates the relation arriving as an array", () => {
    // PostgREST returns an object for a many-to-one embed, but the generated
    // client types can model the same relation as an array.
    expect(
      toReportLeaveRows([{ days: 1, leave_policies: [{ type: "sick" }] }])
    ).toEqual([{ leave_type: "sick", days: 1 }]);
  });

  it("yields a null type when the policy is missing, so the report can bucket it", () => {
    expect(toReportLeaveRows([{ days: 3, leave_policies: null }])).toEqual([
      { leave_type: null, days: 3 },
    ]);
    expect(toReportLeaveRows([{ days: 3 }])).toEqual([
      { leave_type: null, days: 3 },
    ]);
  });

  it("coerces numeric days arriving as a string", () => {
    // `leave_requests.days` is numeric; postgres numerics can surface as
    // strings over PostgREST.
    expect(
      toReportLeaveRows([{ days: "2.5", leave_policies: { type: "paid" } }])
    ).toEqual([{ leave_type: "paid", days: 2.5 }]);
  });

  it("maps an empty result to an empty list", () => {
    expect(toReportLeaveRows([])).toEqual([]);
  });
});

describe("buildLeaveReport over mapped rows", () => {
  it("sums days per policy type across the range", () => {
    const rows = toReportLeaveRows([
      { days: 2, leave_policies: { type: "casual" } },
      { days: 1, leave_policies: { type: "sick" } },
      { days: 3, leave_policies: { type: "casual" } },
    ]);

    const report = buildLeaveReport({ from: "2026-09-01", to: "2026-09-30", approvedLeaves: rows });

    expect(report.totalDays).toBe(6);
    expect(report.byType).toEqual([
      { type: "casual", days: 5 },
      { type: "sick", days: 1 },
    ]);
  });

  it("buckets a request whose policy is gone under 'other'", () => {
    const rows = toReportLeaveRows([{ days: 4, leave_policies: null }]);

    const report = buildLeaveReport({ from: "2026-09-01", to: "2026-09-30", approvedLeaves: rows });

    expect(report.totalDays).toBe(4);
    expect(report.byType).toEqual([{ type: "other", days: 4 }]);
  });

  it("counts a half-day leave as 0.5", () => {
    const rows = toReportLeaveRows([{ days: 0.5, leave_policies: { type: "casual" } }]);

    expect(buildLeaveReport({ from: "2026-09-01", to: "2026-09-30", approvedLeaves: rows }).totalDays).toBe(0.5);
  });
});
