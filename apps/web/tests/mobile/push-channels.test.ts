import { describe, it, expect } from "vitest";
import {
  ANDROID_CHANNELS,
  DEFAULT_ANDROID_CHANNEL,
  channelForNotificationType,
  pushPriorityForChannel,
} from "@jambahr/shared/mobile/push-channels";

describe("ANDROID_CHANNELS", () => {
  it("declares unique, versioned ids", () => {
    const ids = ANDROID_CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Channel settings are immutable on-device once created, so raising an
    // importance later means shipping a new id. A bare "approvals" would leave
    // nowhere to go.
    for (const id of ids) expect(id).toMatch(/_v\d+$/);
  });

  it("gives every channel user-facing text (Android shows these in Settings)", () => {
    for (const channel of ANDROID_CHANNELS) {
      expect(channel.name.length).toBeGreaterThan(0);
      expect(channel.description.length).toBeGreaterThan(0);
    }
  });

  it("has exactly one high-importance channel", () => {
    // If everything is urgent, nothing is — and the user mutes the lot.
    const high = ANDROID_CHANNELS.filter((c) => c.importance === "high");
    expect(high).toHaveLength(1);
    expect(high[0]!.id).toBe("approvals_v1");
  });

  it("includes the default channel in the list the client creates", () => {
    // The server can name DEFAULT_ANDROID_CHANNEL, so the client must create it
    // — otherwise those notifications land on Android's silent fallback.
    expect(ANDROID_CHANNELS.map((c) => c.id)).toContain(DEFAULT_ANDROID_CHANNEL);
  });
});

describe("channelForNotificationType", () => {
  it("routes work-waiting-on-you to the high-importance channel", () => {
    expect(channelForNotificationType("approval_pending")).toBe("approvals_v1");
  });

  it("routes informational types to updates", () => {
    for (const type of ["leave_decision", "payslip_paid", "doc_ack", "announcement"]) {
      expect(channelForNotificationType(type)).toBe("updates_v1");
    }
  });

  it("defaults unknown/missing types to updates, never to the interrupting channel", () => {
    // A new notification type must be an explicit decision to interrupt.
    expect(channelForNotificationType(undefined)).toBe("updates_v1");
    expect(channelForNotificationType(null)).toBe("updates_v1");
    expect(channelForNotificationType("something_new")).toBe("updates_v1");
  });
});

describe("pushPriorityForChannel", () => {
  it("tracks channel importance", () => {
    // A high-importance channel delivered at normal FCM priority still arrives
    // late on a dozing device, which reads as a broken feature.
    expect(pushPriorityForChannel("approvals_v1")).toBe("high");
    expect(pushPriorityForChannel("updates_v1")).toBe("normal");
  });

  it("agrees with the declared importance for every channel", () => {
    for (const channel of ANDROID_CHANNELS) {
      const expected = channel.importance === "high" ? "high" : "normal";
      expect(pushPriorityForChannel(channel.id)).toBe(expected);
    }
  });
});
