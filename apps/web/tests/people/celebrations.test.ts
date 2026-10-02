import { describe, it, expect } from "vitest";
import { upcomingCelebrations, type CelebrationPerson } from "@jambahr/shared/people/celebrations";

const person = (over: Partial<CelebrationPerson>): CelebrationPerson => ({
  id: "e1",
  name: "Priya",
  avatarUrl: null,
  dateOfBirth: null,
  dateOfJoining: null,
  ...over,
});

describe("upcomingCelebrations", () => {
  it("finds a birthday later this month, without the year", () => {
    const [c] = upcomingCelebrations([person({ dateOfBirth: "1994-10-05" })], "2026-10-01", 14);
    expect(c).toMatchObject({ kind: "birthday", date: "2026-10-05", daysAway: 4, years: null });
  });

  it("today counts", () => {
    expect(upcomingCelebrations([person({ dateOfBirth: "1990-10-01" })], "2026-10-01", 14)[0].daysAway).toBe(0);
  });

  it("wraps around the new year", () => {
    const [c] = upcomingCelebrations([person({ dateOfBirth: "1990-01-03" })], "2026-12-28", 14);
    expect(c).toMatchObject({ date: "2027-01-03", daysAway: 6 });
  });

  it("ignores dates outside the window and already passed", () => {
    expect(upcomingCelebrations([person({ dateOfBirth: "1990-11-30" })], "2026-10-01", 14)).toEqual([]);
    expect(upcomingCelebrations([person({ dateOfBirth: "1990-09-30" })], "2026-10-01", 14)).toEqual([]);
  });

  it("work anniversary counts completed years; joining this year doesn't count", () => {
    const [c] = upcomingCelebrations([person({ dateOfJoining: "2023-10-10" })], "2026-10-01", 14);
    expect(c).toMatchObject({ kind: "anniversary", years: 3, date: "2026-10-10" });
    expect(upcomingCelebrations([person({ dateOfJoining: "2026-10-10" })], "2026-10-01", 14)).toEqual([]);
  });

  it("29 Feb birthdays fall on 28 Feb in non-leap years", () => {
    const [c] = upcomingCelebrations([person({ dateOfBirth: "1996-02-29" })], "2027-02-20", 14);
    expect(c.date).toBe("2027-02-28");
  });

  it("sorts by soonest, birthdays before anniversaries on the same day", () => {
    const list = upcomingCelebrations(
      [
        person({ id: "a", name: "A", dateOfJoining: "2020-10-03" }),
        person({ id: "b", name: "B", dateOfBirth: "1990-10-03" }),
        person({ id: "c", name: "C", dateOfBirth: "1990-10-02" }),
      ],
      "2026-10-01",
      14,
    );
    expect(list.map((c) => c.name)).toEqual(["C", "B", "A"]);
  });
});
