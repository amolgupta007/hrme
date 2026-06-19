import { describe, it, expect } from "vitest";
import { isOwner } from "../../src/types/index";

describe("isOwner", () => {
  it("is true only for owner", () => {
    expect(isOwner("owner")).toBe(true);
    expect(isOwner("admin")).toBe(false);
    expect(isOwner("manager")).toBe(false);
    expect(isOwner("employee")).toBe(false);
  });
});
