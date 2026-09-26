import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The mobile BFF's half of the 2026-09-26 outage fix.
 *
 * Every /api/mobile/* route used to answer 403 `no_membership` whenever
 * getCurrentUser came back empty — including when it came back empty because
 * the database was unreachable. The app maps `no_membership` to a "no
 * workspace" screen, so an outage told users their org was gone. A lookup that
 * FAILED must be 503, distinct from a lookup that found nothing (403).
 */

const getCurrentUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
  isAdmin: (r: string) => r === "owner" || r === "admin",
  isManagerOrAbove: (r: string) =>
    r === "owner" || r === "admin" || r === "manager",
}));

import { resolveMobileUser } from "@/lib/mobile/auth";

/** Shaped like the real MembershipLookupError without importing the mocked module. */
function lookupFailure(): Error {
  const err = new Error("Could not read org memberships from the database");
  err.name = "MembershipLookupError";
  return err;
}

const request = (orgId?: string) =>
  new Request("https://jambahr.com/api/mobile/me", {
    headers: orgId ? { "x-org-id": orgId } : {},
  });

describe("resolveMobileUser", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("returns 503 service_unavailable when the membership lookup FAILS", async () => {
    getCurrentUserMock.mockRejectedValue(lookupFailure());

    const result = await resolveMobileUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(503);
    await expect(result.response.json()).resolves.toEqual({
      error: "service_unavailable",
    });
  });

  it("returns 403 no_membership when the lookup RAN and found nothing", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const result = await resolveMobileUser(request());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.response.status).toBe(403);
    await expect(result.response.json()).resolves.toEqual({
      error: "no_membership",
    });
  });

  it("passes X-Org-Id through as the orgIdHint", async () => {
    getCurrentUserMock.mockResolvedValue({ orgId: "org-9", role: "admin" });

    const result = await resolveMobileUser(request("org-9"));

    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: "org-9" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.user.orgId).toBe("org-9");
  });

  it("sends a null hint when the header is absent (first-membership path)", async () => {
    getCurrentUserMock.mockResolvedValue({ orgId: "org-1", role: "owner" });

    await resolveMobileUser(request());

    expect(getCurrentUserMock).toHaveBeenCalledWith({ orgIdHint: null });
  });

  it("re-throws errors that are NOT membership-lookup failures", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("clerk exploded"));

    await expect(resolveMobileUser(request())).rejects.toThrow(
      "clerk exploded"
    );
  });
});
