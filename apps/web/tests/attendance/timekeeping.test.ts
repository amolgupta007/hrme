import { describe, it, expect } from "vitest";
import {
  resolveTimekeepingMode,
  splitPunchesForTimekeeping,
  isDeviceOnlyDay,
  normalizeTimekeepingSettings,
} from "@jambahr/shared/attendance/timekeeping";

const ev = (source: string, t: string) => ({ id: `${source}-${t}`, punched_at: `2026-10-01T${t}:00Z`, location_id: null, source });

describe("normalizeTimekeepingSettings", () => {
  it("defaults to all sources", () => {
    expect(normalizeTimekeepingSettings(undefined)).toEqual({ source: "all", from: null });
    expect(normalizeTimekeepingSettings({ attendance: {} })).toEqual({ source: "all", from: null });
  });
  it("reads web_app with its start date", () => {
    expect(
      normalizeTimekeepingSettings({ attendance: { timekeeping_source: "web_app", timekeeping_source_from: "2026-10-01" } })
    ).toEqual({ source: "web_app", from: "2026-10-01" });
  });
  it("garbage values fall back to all", () => {
    expect(normalizeTimekeepingSettings({ attendance: { timekeeping_source: "nope" } }).source).toBe("all");
  });
});

describe("resolveTimekeepingMode", () => {
  const settings = { attendance: { timekeeping_source: "web_app", timekeeping_source_from: "2026-10-01" } };
  it("is web_app from the switch date on", () => {
    expect(resolveTimekeepingMode(settings, "2026-10-01")).toBe("web_app");
    expect(resolveTimekeepingMode(settings, "2026-10-15")).toBe("web_app");
  });
  it("earlier days keep the old behaviour", () => {
    expect(resolveTimekeepingMode(settings, "2026-09-30")).toBe("all");
  });
  it("no start date → applies to every day", () => {
    expect(resolveTimekeepingMode({ attendance: { timekeeping_source: "web_app" } }, "2020-01-01")).toBe("web_app");
  });
});

describe("splitPunchesForTimekeeping", () => {
  const events = [ev("adms", "03:35"), ev("web", "04:00"), ev("mobile", "08:00"), ev("manual", "12:30"), ev("adms", "12:40")];

  it("web_app: web, mobile and manual keep time; device punches are presence only", () => {
    const { timekeeping, presence } = splitPunchesForTimekeeping(events, "web_app");
    expect(timekeeping.map((e) => e.source)).toEqual(["web", "mobile", "manual"]);
    expect(presence.map((e) => e.source)).toEqual(["adms", "adms"]);
  });

  it("all: every punch keeps time (today's behaviour); device punches still reported as presence", () => {
    const { timekeeping, presence } = splitPunchesForTimekeeping(events, "all");
    expect(timekeeping).toHaveLength(5);
    expect(presence).toHaveLength(2);
  });

  it("a sourceless legacy event counts as a device punch (historical default)", () => {
    const { timekeeping, presence } = splitPunchesForTimekeeping([{ id: "x", punched_at: "", location_id: null } as { source?: string }], "web_app");
    expect(timekeeping).toHaveLength(0);
    expect(presence).toHaveLength(1);
  });
});

describe("isDeviceOnlyDay", () => {
  it("seen at the device with no clock-in", () => {
    expect(isDeviceOnlyDay({ clock_in_at: null, device_first_seen_at: "2026-10-01T03:35:00Z" })).toBe(true);
  });
  it("clocked in, or never seen → false", () => {
    expect(isDeviceOnlyDay({ clock_in_at: "2026-10-01T04:00:00Z", device_first_seen_at: "2026-10-01T03:35:00Z" })).toBe(false);
    expect(isDeviceOnlyDay({ clock_in_at: null, device_first_seen_at: null })).toBe(false);
  });
});
