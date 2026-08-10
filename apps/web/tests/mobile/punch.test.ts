import { describe, expect, it } from "vitest";
import { PunchBodySchema, isWithinClockSkew, CLOCK_SKEW_MS } from "@/lib/mobile/punch";

describe("PunchBodySchema", () => {
  it("accepts a valid body with UTC punchedAt and optional coords", () => {
    const r = PunchBodySchema.safeParse({
      clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
      punchedAt: "2026-07-17T04:00:00.000Z",
      lat: 19.07,
      lng: 72.87,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a body without coords", () => {
    const r = PunchBodySchema.safeParse({
      clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
      punchedAt: "2026-07-17T04:00:00Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-uuid clientEventId", () => {
    const r = PunchBodySchema.safeParse({
      clientEventId: "not-a-uuid",
      punchedAt: "2026-07-17T04:00:00Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO punchedAt", () => {
    const r = PunchBodySchema.safeParse({
      clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
      punchedAt: "17/07/2026 09:30",
    });
    expect(r.success).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    const r = PunchBodySchema.safeParse({
      clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
      punchedAt: "2026-07-17T04:00:00Z",
      lat: 200,
      lng: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("isWithinClockSkew", () => {
  const now = new Date("2026-07-17T12:00:00.000Z").getTime();

  it("accepts a punch at server-now", () => {
    expect(isWithinClockSkew("2026-07-17T12:00:00.000Z", now)).toBe(true);
  });

  it("accepts a punch 23h ago", () => {
    expect(isWithinClockSkew("2026-07-16T13:00:00.000Z", now)).toBe(true);
  });

  it("rejects a punch 25h in the future", () => {
    expect(isWithinClockSkew("2026-07-18T13:00:00.000Z", now)).toBe(false);
  });

  it("rejects an unparseable timestamp", () => {
    expect(isWithinClockSkew("garbage", now)).toBe(false);
  });

  it("exposes a 24h window", () => {
    expect(CLOCK_SKEW_MS).toBe(24 * 60 * 60 * 1000);
  });
});
