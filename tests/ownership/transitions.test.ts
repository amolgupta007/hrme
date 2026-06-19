import { describe, it, expect } from "vitest";
import { isExpired, canAccept, canCancel, identityMatches } from "../../src/lib/ownership/transitions";

const NOW = Date.parse("2026-06-19T00:00:00Z");
const base = { status: "pending" as const, expires_at: "2026-06-30T00:00:00Z", to_email: "jane@co.com", to_phone: null };

describe("ownership transitions", () => {
  it("isExpired true only past expiry", () => {
    expect(isExpired(base, NOW)).toBe(false);
    expect(isExpired({ ...base, expires_at: "2026-06-01T00:00:00Z" }, NOW)).toBe(true);
  });

  it("canAccept requires pending and not expired", () => {
    expect(canAccept(base, NOW)).toBe(true);
    expect(canAccept({ ...base, status: "accepted" }, NOW)).toBe(false);
    expect(canAccept({ ...base, expires_at: "2026-06-01T00:00:00Z" }, NOW)).toBe(false);
  });

  it("canCancel requires pending", () => {
    expect(canCancel(base)).toBe(true);
    expect(canCancel({ ...base, status: "cancelled" })).toBe(false);
  });

  it("identityMatches by email case-insensitively or phone", () => {
    expect(identityMatches({ email: "JANE@CO.COM" }, base)).toBe(true);
    expect(identityMatches({ email: "x@y.com" }, base)).toBe(false);
    const byPhone = { ...base, to_email: null, to_phone: "+919812345678" };
    expect(identityMatches({ phone: "+919812345678" }, byPhone)).toBe(true);
    expect(identityMatches({ phone: "+910000000000" }, byPhone)).toBe(false);
  });
});
