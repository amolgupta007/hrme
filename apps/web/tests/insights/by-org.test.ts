import { describe, it, expect } from "vitest";
import { groupByOrg } from "@/lib/insights/by-org";

type Row = { org_id: string; n: number };
const ORGS = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Beta" },
];

describe("groupByOrg", () => {
  it("runs the builder once per org over that org's rows, in orgs order", () => {
    const rows: Row[] = [
      { org_id: "a", n: 1 },
      { org_id: "b", n: 10 },
      { org_id: "a", n: 2 },
    ];
    const out = groupByOrg(rows, ORGS, (r) => r.org_id, (rs) => ({
      sum: rs.reduce((s, r) => s + r.n, 0),
    }));
    expect(out).toEqual([
      { orgId: "a", orgName: "Acme", sum: 3 },
      { orgId: "b", orgName: "Beta", sum: 10 },
    ]);
  });

  it("includes orgs with zero rows (builder gets an empty array)", () => {
    const out = groupByOrg([] as Row[], ORGS, (r) => r.org_id, (rs) => ({ count: rs.length }));
    expect(out).toEqual([
      { orgId: "a", orgName: "Acme", count: 0 },
      { orgId: "b", orgName: "Beta", count: 0 },
    ]);
  });
});
