import { describe, expect, it } from "vitest";
import { RegularizeBodySchema, validateRegularization } from "@/lib/mobile/regularize";

describe("RegularizeBodySchema", () => {
  const good = {
    date: "2026-07-15",
    proposedIn: "2026-07-15T09:30:00+05:30",
    proposedOut: "2026-07-15T18:00:00+05:30",
    reason: "Forgot to punch — client site visit",
  };

  it("accepts a valid body with in + out", () => {
    expect(RegularizeBodySchema.safeParse(good).success).toBe(true);
  });

  it("accepts a null / omitted proposedOut", () => {
    expect(RegularizeBodySchema.safeParse({ ...good, proposedOut: null }).success).toBe(true);
    const { proposedOut: _omit, ...noOut } = good;
    expect(RegularizeBodySchema.safeParse(noOut).success).toBe(true);
  });

  it("rejects a malformed date", () => {
    expect(RegularizeBodySchema.safeParse({ ...good, date: "15-07-2026" }).success).toBe(false);
  });

  it("rejects a non-ISO proposedIn", () => {
    expect(RegularizeBodySchema.safeParse({ ...good, proposedIn: "9:30 AM" }).success).toBe(false);
  });

  it("rejects a missing / too-short / too-long reason", () => {
    expect(RegularizeBodySchema.safeParse({ ...good, reason: "" }).success).toBe(false);
    expect(RegularizeBodySchema.safeParse({ ...good, reason: "ok" }).success).toBe(false);
    expect(RegularizeBodySchema.safeParse({ ...good, reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("validateRegularization", () => {
  const base = {
    date: "2026-07-15",
    proposedIn: "2026-07-15T09:30:00+05:30",
    proposedOut: "2026-07-15T18:00:00+05:30" as string | null,
    todayIst: "2026-07-17",
    dateOfJoining: "2026-01-01" as string | null,
  };

  it("accepts a past day with out after in on the same IST day", () => {
    const r = validateRegularization(base);
    expect(r).toEqual({
      ok: true,
      events: [
        { punchType: "in", punchedAtIso: "2026-07-15T04:00:00.000Z" },
        { punchType: "out", punchedAtIso: "2026-07-15T12:30:00.000Z" },
      ],
    });
  });

  it("produces a single in event when proposedOut is null", () => {
    const r = validateRegularization({ ...base, proposedOut: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events).toHaveLength(1);
  });

  it("rejects today (corrections for today go through normal punching)", () => {
    const r = validateRegularization({
      ...base,
      date: "2026-07-17",
      proposedIn: "2026-07-17T09:30:00+05:30",
      proposedOut: null,
    });
    expect(r).toEqual({ ok: false, error: "date_not_past" });
  });

  it("rejects a future day", () => {
    const r = validateRegularization({
      ...base,
      date: "2026-07-20",
      proposedIn: "2026-07-20T09:30:00+05:30",
      proposedOut: null,
    });
    expect(r).toEqual({ ok: false, error: "date_not_past" });
  });

  it("rejects a day before employment", () => {
    const r = validateRegularization({ ...base, dateOfJoining: "2026-07-16" });
    expect(r).toEqual({ ok: false, error: "before_employment" });
  });

  it("tolerates a null dateOfJoining", () => {
    expect(validateRegularization({ ...base, dateOfJoining: null }).ok).toBe(true);
  });

  it("rejects a proposedIn that falls on a different IST day than `date`", () => {
    // 2026-07-15T23:00Z = 2026-07-16 04:30 IST → not on 2026-07-15
    const r = validateRegularization({
      ...base,
      proposedIn: "2026-07-15T23:00:00Z",
      proposedOut: null,
    });
    expect(r).toEqual({ ok: false, error: "in_not_on_date" });
  });

  it("rejects a proposedOut on a different IST day (no overnight in v1)", () => {
    const r = validateRegularization({
      ...base,
      proposedOut: "2026-07-16T02:00:00+05:30",
    });
    expect(r).toEqual({ ok: false, error: "out_not_on_date" });
  });

  it("rejects out at-or-before in", () => {
    expect(
      validateRegularization({ ...base, proposedOut: "2026-07-15T09:30:00+05:30" }),
    ).toEqual({ ok: false, error: "out_before_in" });
    expect(
      validateRegularization({ ...base, proposedOut: "2026-07-15T08:00:00+05:30" }),
    ).toEqual({ ok: false, error: "out_before_in" });
  });

  it("accepts UTC-offset inputs that land on the right IST day", () => {
    // 04:00Z = 09:30 IST on the same date
    const r = validateRegularization({
      ...base,
      proposedIn: "2026-07-15T04:00:00Z",
      proposedOut: "2026-07-15T12:30:00Z",
    });
    expect(r.ok).toBe(true);
  });
});
