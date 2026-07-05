import { describe, it, expect } from "vitest";
import { planNotificationKinds } from "@/lib/attendance/late-policy-notify";

const policy = { threshold_days: 3, warn_at: 2, notify_on_late: true, notify_on_threshold: true };

describe("planNotificationKinds", () => {
  it("returns ['late'] on a normal late punch below thresholds", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 0, newCount: 1 })).toEqual(["late"]);
  });
  it("adds 'warn' when newCount hits warn_at", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 1, newCount: 2 }).sort()).toEqual(["late", "warn"]);
  });
  it("adds 'threshold' only on the crossing punch", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 2, newCount: 3 }).sort()).toEqual(["late", "threshold"]);
  });
  it("does not repeat 'threshold' after already crossed", () => {
    expect(planNotificationKinds({ policy, isLate: true, prevCount: 3, newCount: 4 })).toEqual(["late"]);
  });
  it("returns [] when not late", () => {
    expect(planNotificationKinds({ policy, isLate: false, prevCount: 0, newCount: 0 })).toEqual([]);
  });
  it("respects notify_on_late=false", () => {
    expect(planNotificationKinds({ policy: { ...policy, notify_on_late: false }, isLate: true, prevCount: 2, newCount: 3 })).toEqual(["threshold"]);
  });
});
