import { describe, it, expect } from "vitest";
import {
  evaluateDeviceHealth,
  findSilentDevices,
  describeSilence,
  DEVICE_SILENCE_THRESHOLD_HOURS,
  type DeviceHealthRow,
} from "@jambahr/shared/attendance/device-health";

const NOW = Date.parse("2026-08-13T07:00:00Z");

function hoursAgo(h: number): string {
  return new Date(NOW - h * 3_600_000).toISOString();
}

function device(over: Partial<DeviceHealthRow> = {}): DeviceHealthRow {
  return {
    id: "dev-1",
    orgId: "org-1",
    serial: "NYU7261204139",
    label: "Reception",
    isActive: true,
    lastSeenAt: hoursAgo(1),
    silenceAlertedAt: null,
    createdAt: hoursAgo(1000),
    ...over,
  };
}

describe("evaluateDeviceHealth — silence threshold", () => {
  it("stays quiet for a device seen recently", () => {
    expect(evaluateDeviceHealth(device({ lastSeenAt: hoursAgo(1) }), NOW)).toBeNull();
  });

  it("stays quiet just under the threshold (overnight/weekend gaps are normal)", () => {
    const justUnder = hoursAgo(DEVICE_SILENCE_THRESHOLD_HOURS - 1);
    expect(evaluateDeviceHealth(device({ lastSeenAt: justUnder }), NOW)).toBeNull();
  });

  it("alerts at the threshold", () => {
    const at = hoursAgo(DEVICE_SILENCE_THRESHOLD_HOURS);
    const alert = evaluateDeviceHealth(device({ lastSeenAt: at }), NOW)!;
    expect(alert.silentHours).toBe(DEVICE_SILENCE_THRESHOLD_HOURS);
    expect(alert.neverConnected).toBe(false);
  });

  it("catches the real Medialoop outage (6 days silent)", () => {
    const alert = evaluateDeviceHealth(
      device({ lastSeenAt: "2026-08-07T09:20:35Z" }),
      NOW,
    )!;
    expect(alert).not.toBeNull();
    expect(describeSilence(alert)).toBe("5 days");
  });

  it("ignores a future or unparseable last_seen_at rather than crying outage", () => {
    expect(evaluateDeviceHealth(device({ lastSeenAt: hoursAgo(-5) }), NOW)).toBeNull();
    expect(evaluateDeviceHealth(device({ lastSeenAt: "not-a-date" }), NOW)).toBeNull();
  });
});

describe("evaluateDeviceHealth — inactive devices", () => {
  it("never alerts on a deactivated device", () => {
    // Deactivating in the portal is the supported way to retire hardware; it
    // must not keep generating alerts forever.
    const retired = device({ isActive: false, lastSeenAt: hoursAgo(5000) });
    expect(evaluateDeviceHealth(retired, NOW)).toBeNull();
  });
});

describe("evaluateDeviceHealth — never connected", () => {
  it("stays quiet inside the installation grace period", () => {
    // Registration happens BEFORE the device is physically configured, so a
    // fresh registration is legitimately silent.
    const fresh = device({ lastSeenAt: null, createdAt: hoursAgo(2) });
    expect(evaluateDeviceHealth(fresh, NOW)).toBeNull();
  });

  it("alerts once the grace period has passed — a failed install", () => {
    const stale = device({ lastSeenAt: null, createdAt: hoursAgo(48) });
    const alert = evaluateDeviceHealth(stale, NOW)!;
    expect(alert.neverConnected).toBe(true);
    expect(alert.silentHours).toBeNull();
    expect(describeSilence(alert)).toBe("never connected");
  });

  it("alerts when createdAt is missing or unparseable", () => {
    // A device we can't date is one a human should look at.
    expect(evaluateDeviceHealth(device({ lastSeenAt: null, createdAt: null }), NOW)).not.toBeNull();
    expect(
      evaluateDeviceHealth(device({ lastSeenAt: null, createdAt: "junk" }), NOW),
    ).not.toBeNull();
  });
});

describe("evaluateDeviceHealth — re-alert cadence", () => {
  const silent = { lastSeenAt: hoursAgo(100) };

  it("suppresses a repeat within the re-alert window", () => {
    const d = device({ ...silent, silenceAlertedAt: hoursAgo(2) });
    expect(evaluateDeviceHealth(d, NOW)).toBeNull();
  });

  it("nags again once a day has passed — a multi-day outage should keep asking", () => {
    const d = device({ ...silent, silenceAlertedAt: hoursAgo(25) });
    expect(evaluateDeviceHealth(d, NOW)).not.toBeNull();
  });

  it("alerts when it has never been alerted on", () => {
    expect(evaluateDeviceHealth(device({ ...silent, silenceAlertedAt: null }), NOW)).not.toBeNull();
  });

  it("treats an unparseable alert timestamp as 'not recently alerted'", () => {
    const d = device({ ...silent, silenceAlertedAt: "junk" });
    expect(evaluateDeviceHealth(d, NOW)).not.toBeNull();
  });
});

describe("findSilentDevices — ordering and filtering", () => {
  it("returns only the unhealthy ones", () => {
    const fleet = [
      device({ id: "ok", lastSeenAt: hoursAgo(1) }),
      device({ id: "silent", lastSeenAt: hoursAgo(100) }),
      device({ id: "retired", isActive: false, lastSeenAt: hoursAgo(999) }),
    ];
    expect(findSilentDevices(fleet, NOW).map((a) => a.device.id)).toEqual(["silent"]);
  });

  it("puts never-connected first, then the longest silence", () => {
    const fleet = [
      device({ id: "short", lastSeenAt: hoursAgo(20) }),
      device({ id: "long", lastSeenAt: hoursAgo(300) }),
      device({ id: "never", lastSeenAt: null, createdAt: hoursAgo(200) }),
    ];
    expect(findSilentDevices(fleet, NOW).map((a) => a.device.id)).toEqual([
      "never",
      "long",
      "short",
    ]);
  });

  it("returns an empty list for a healthy fleet", () => {
    expect(findSilentDevices([device(), device({ id: "d2" })], NOW)).toEqual([]);
  });
});

describe("describeSilence", () => {
  it("uses days past 24h and singularises correctly", () => {
    const at = (h: number) =>
      describeSilence(evaluateDeviceHealth(device({ lastSeenAt: hoursAgo(h) }), NOW)!);
    expect(at(13)).toBe("13 hours");
    expect(at(24)).toBe("1 day");
    expect(at(49)).toBe("2 days");
  });
});
