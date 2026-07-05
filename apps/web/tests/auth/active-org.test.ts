import { describe, it, expect } from "vitest";
import { resolveActiveOrg, ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";

type M = { orgId: string };
const members: M[] = [{ orgId: "a" }, { orgId: "b" }, { orgId: "c" }];

describe("resolveActiveOrg", () => {
  it("returns the cookie org when the user is a member of it", () => {
    expect(resolveActiveOrg(members, "b")).toBe("b");
  });
  it("falls back to the first membership when the cookie is absent", () => {
    expect(resolveActiveOrg(members, null)).toBe("a");
    expect(resolveActiveOrg(members, undefined)).toBe("a");
  });
  it("ignores a cookie org the user is NOT a member of (anti-tamper)", () => {
    expect(resolveActiveOrg(members, "zzz")).toBe("a");
  });
  it("returns null when the user has no memberships", () => {
    expect(resolveActiveOrg([], "a")).toBeNull();
  });
  it("exposes a stable cookie name", () => {
    expect(ACTIVE_ORG_COOKIE).toBe("jambahr_active_org");
  });
});
