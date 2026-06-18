import { describe, it, expect } from "vitest";
import { resolveScopedOrgIds } from "@/lib/insights/org-scope";

const ELIGIBLE = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Beta" },
];

describe("resolveScopedOrgIds", () => {
  it("defaults to the active org only when no orgs requested", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, null, "a");
    expect(r.orgIds).toEqual(["a"]);
    expect(r.orgs).toEqual([{ id: "a", name: "Acme" }]);
  });

  it("keeps only requested ids that are in the eligible set", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["a", "b"], "a");
    expect(r.orgIds).toEqual(["a", "b"]);
  });

  it("silently drops requested ids that are NOT eligible (tamper guard)", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["a", "evil"], "a");
    expect(r.orgIds).toEqual(["a"]);
  });

  it("falls back to the active org when the request filters to empty", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["evil"], "a");
    expect(r.orgIds).toEqual(["a"]);
  });

  it("dedupes and preserves eligible-set order", () => {
    const r = resolveScopedOrgIds(ELIGIBLE, ["b", "a", "b"], "a");
    expect(r.orgIds).toEqual(["a", "b"]);
  });

  it("returns empty when activeOrgId is not eligible and nothing valid requested", () => {
    const r = resolveScopedOrgIds([], ["x"], "a");
    expect(r.orgIds).toEqual([]);
    expect(r.orgs).toEqual([]);
  });
});
