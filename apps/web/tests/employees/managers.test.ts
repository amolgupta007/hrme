import { describe, it, expect } from "vitest";
import { managerIdsOf, isManagerOfEmployee } from "@/lib/managers";

describe("managerIdsOf", () => {
  it("returns both managers when set", () => {
    expect(managerIdsOf({ reporting_manager_id: "a", reporting_manager_2_id: "b" })).toEqual(["a", "b"]);
  });
  it("skips null slots", () => {
    expect(managerIdsOf({ reporting_manager_id: null, reporting_manager_2_id: "b" })).toEqual(["b"]);
    expect(managerIdsOf({ reporting_manager_id: "a", reporting_manager_2_id: null })).toEqual(["a"]);
    expect(managerIdsOf({ reporting_manager_id: null, reporting_manager_2_id: null })).toEqual([]);
  });
  it("dedupes (defense in depth vs the DB check)", () => {
    expect(managerIdsOf({ reporting_manager_id: "a", reporting_manager_2_id: "a" })).toEqual(["a"]);
  });
});

describe("isManagerOfEmployee", () => {
  const emp = { reporting_manager_id: "a", reporting_manager_2_id: "b" };
  it("true for either slot", () => {
    expect(isManagerOfEmployee("a", emp)).toBe(true);
    expect(isManagerOfEmployee("b", emp)).toBe(true);
  });
  it("false otherwise", () => {
    expect(isManagerOfEmployee("c", emp)).toBe(false);
    expect(isManagerOfEmployee("a", { reporting_manager_id: null, reporting_manager_2_id: null })).toBe(false);
  });
});
