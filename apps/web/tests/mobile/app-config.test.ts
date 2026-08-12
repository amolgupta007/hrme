import { describe, it, expect } from "vitest";
import {
  compareVersions,
  isVersionBlocked,
  isUpdateAvailable,
  normalizeAppConfig,
  DEFAULT_APP_CONFIG,
} from "@jambahr/shared/mobile/app-config";

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1); // numeric, not lexical
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("tolerates a leading v and a pre-release suffix", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3-beta.1", "1.2.3")).toBe(0);
  });

  it("returns null for anything unparseable", () => {
    expect(compareVersions("", "1.0.0")).toBeNull();
    expect(compareVersions("1.0", "1.0.0")).toBeNull();
    expect(compareVersions("latest", "1.0.0")).toBeNull();
  });
});

describe("isVersionBlocked — fails open", () => {
  it("blocks a build below the floor", () => {
    expect(isVersionBlocked("1.0.0", "1.2.0")).toBe(true);
  });

  it("allows the floor itself and anything above it", () => {
    expect(isVersionBlocked("1.2.0", "1.2.0")).toBe(false);
    expect(isVersionBlocked("1.3.0", "1.2.0")).toBe(false);
  });

  it("never blocks when either version is missing or unparseable", () => {
    // The whole point: a parsing bug that locks every employee out of clocking
    // in during working hours is far worse than an old client limping along.
    expect(isVersionBlocked(null, "1.2.0")).toBe(false);
    expect(isVersionBlocked("1.0.0", null)).toBe(false);
    expect(isVersionBlocked("1.0.0", "")).toBe(false);
    expect(isVersionBlocked("nonsense", "1.2.0")).toBe(false);
    expect(isVersionBlocked("1.0.0", "nonsense")).toBe(false);
  });

  it("blocks nobody at the default floor", () => {
    expect(isVersionBlocked("0.0.1", DEFAULT_APP_CONFIG.minVersion)).toBe(false);
    expect(isVersionBlocked("0.0.0", DEFAULT_APP_CONFIG.minVersion)).toBe(false);
  });
});

describe("isUpdateAvailable", () => {
  it("is true only when a strictly newer version exists", () => {
    expect(isUpdateAvailable("1.0.0", "1.1.0")).toBe(true);
    expect(isUpdateAvailable("1.1.0", "1.1.0")).toBe(false);
    expect(isUpdateAvailable("1.2.0", "1.1.0")).toBe(false);
  });

  it("is false when either side is unknown", () => {
    expect(isUpdateAvailable("1.0.0", null)).toBe(false);
    expect(isUpdateAvailable(null, "1.1.0")).toBe(false);
  });
});

describe("normalizeAppConfig", () => {
  it("degrades to permissive defaults for junk input", () => {
    for (const raw of [null, undefined, 7, "1.0.0", []]) {
      expect(normalizeAppConfig(raw)).toEqual(DEFAULT_APP_CONFIG);
    }
  });

  it("rejects an unparseable minVersion rather than trusting it", () => {
    // A typo'd env var must not become a floor nobody can satisfy.
    expect(normalizeAppConfig({ minVersion: "one.two.three" }).minVersion).toBe("0.0.0");
    expect(normalizeAppConfig({ minVersion: "2.0.0" }).minVersion).toBe("2.0.0");
  });

  it("only accepts an https update URL", () => {
    expect(normalizeAppConfig({ updateUrl: "https://apps.apple.com/x" }).updateUrl).toBe(
      "https://apps.apple.com/x",
    );
    expect(normalizeAppConfig({ updateUrl: "http://insecure.example" }).updateUrl).toBeNull();
    expect(normalizeAppConfig({ updateUrl: "javascript:alert(1)" }).updateUrl).toBeNull();
  });

  it("drops a blank message and trims the rest", () => {
    expect(normalizeAppConfig({ message: "   " }).message).toBeNull();
    expect(normalizeAppConfig({ message: "  Update please  " }).message).toBe("Update please");
  });

  it("keeps latestVersion only when it parses", () => {
    expect(normalizeAppConfig({ latestVersion: "1.4.1" }).latestVersion).toBe("1.4.1");
    expect(normalizeAppConfig({ latestVersion: "soon" }).latestVersion).toBeNull();
  });
});
