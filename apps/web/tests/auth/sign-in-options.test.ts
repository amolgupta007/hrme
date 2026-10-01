import { describe, it, expect } from "vitest";
import {
  maskPhone,
  shouldShowPasswordPrompt,
  PASSWORD_PROMPT_SNOOZE_MS,
} from "@/lib/auth/sign-in-options";

describe("shouldShowPasswordPrompt", () => {
  const now = 1_000_000_000_000;
  it("never shows once a password exists", () => {
    expect(shouldShowPasswordPrompt({ passwordEnabled: true, dismissedAt: null, now })).toBe(false);
  });
  it("shows when never dismissed", () => {
    expect(shouldShowPasswordPrompt({ passwordEnabled: false, dismissedAt: null, now })).toBe(true);
  });
  it("stays hidden inside the snooze window", () => {
    expect(
      shouldShowPasswordPrompt({ passwordEnabled: false, dismissedAt: now - 1000, now })
    ).toBe(false);
  });
  it("comes back after the snooze window", () => {
    expect(
      shouldShowPasswordPrompt({
        passwordEnabled: false,
        dismissedAt: now - PASSWORD_PROMPT_SNOOZE_MS,
        now,
      })
    ).toBe(true);
  });
  it("treats a garbage stored value as not dismissed", () => {
    expect(shouldShowPasswordPrompt({ passwordEnabled: false, dismissedAt: NaN, now })).toBe(true);
  });
});

describe("maskPhone", () => {
  it("masks an Indian E.164 number", () => {
    expect(maskPhone("+919421195453")).toBe("+91 ••••• •5453");
  });
  it("handles spaced formats", () => {
    expect(maskPhone("+91 98765 10013")).toBe("+91 ••••• •0013");
  });
  it("keeps last 4 for other shapes", () => {
    expect(maskPhone("7795149888")).toBe("•••• 9888");
  });
  it("returns null for empty or too short", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone("12")).toBeNull();
  });
});
