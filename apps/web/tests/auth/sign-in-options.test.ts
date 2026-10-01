import { describe, it, expect } from "vitest";
import {
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

