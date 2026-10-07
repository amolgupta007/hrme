import { describe, expect, it } from "vitest";
import { isValidIsoDate, mergeHolidayDrafts, parseHolidayCsv, presetToDrafts, restrictToYear } from "@jambahr/shared/holidays/import";

describe("isValidIsoDate", () => {
  it("accepts real dates and rejects overflow and junk", () => {
    expect(isValidIsoDate("2027-02-28")).toBe(true);
    expect(isValidIsoDate("2027-02-29")).toBe(false);
    expect(isValidIsoDate("2027-2-1")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });
});

describe("presetToDrafts", () => {
  it("restricted → optional, gazetted/state → mandatory", () => {
    expect(
      presetToDrafts([
        { region: "national", kind: "gazetted", name: "Holi", date: "2027-03-23" },
        { region: "national", kind: "restricted", name: "Easter Sunday", date: "2027-03-28" },
        { region: "MH", kind: "state", name: "Gudi Padwa", date: "2026-03-19" },
      ])
    ).toEqual([
      { name: "Holi", date: "2027-03-23", isOptional: false },
      { name: "Easter Sunday", date: "2027-03-28", isOptional: true },
      { name: "Gudi Padwa", date: "2026-03-19", isOptional: false },
    ]);
  });
});

describe("mergeHolidayDrafts", () => {
  it("joins two holidays on one date into one row, mandatory if either is", () => {
    const { rows, skipped } = mergeHolidayDrafts(
      [
        { name: "Independence Day", date: "2027-08-15", isOptional: false },
        { name: "Milad-un-Nabi", date: "2027-08-15", isOptional: false },
        { name: "Parsi New Year / Navroz", date: "2027-08-15", isOptional: true },
      ],
      new Set()
    );
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { name: "Independence Day / Milad-un-Nabi / Parsi New Year / Navroz", date: "2027-08-15", isOptional: false },
    ]);
  });

  it("is optional only when every holiday on that date is optional", () => {
    const { rows } = mergeHolidayDrafts(
      [
        { name: "Holika Dahan", date: "2026-03-03", isOptional: true },
        { name: "Dolyatra", date: "2026-03-03", isOptional: true },
      ],
      new Set()
    );
    expect(rows[0].isOptional).toBe(true);
  });

  it("skips dates the org already has, keeps the rest, sorts by date", () => {
    const { rows, skipped } = mergeHolidayDrafts(
      [
        { name: "Christmas", date: "2026-12-25", isOptional: false },
        { name: "Diwali", date: "2026-11-08", isOptional: false },
        { name: "Bhaubeej", date: "2026-11-11", isOptional: false },
      ],
      new Set(["2026-11-08"])
    );
    expect(skipped).toEqual(["2026-11-08"]);
    expect(rows.map((r) => r.date)).toEqual(["2026-11-11", "2026-12-25"]);
  });

  it("drops a repeated identical name and caps the joined name at 80 chars", () => {
    const long = "A".repeat(50);
    const { rows } = mergeHolidayDrafts(
      [
        { name: long, date: "2027-01-01", isOptional: false },
        { name: long, date: "2027-01-01", isOptional: false },
        { name: "B".repeat(50), date: "2027-01-01", isOptional: false },
      ],
      new Set()
    );
    expect(rows[0].name.length).toBeLessThanOrEqual(80);
    expect(rows[0].name.startsWith(long)).toBe(true);
  });
});

describe("parseHolidayCsv", () => {
  it("handles a header, Excel DD/MM/YYYY dates, quoted commas, blank lines", () => {
    const csv = [
      "Name,Date,Optional",
      "Diwali,08/11/2026,no",
      "",
      '"Diwali, Lakshmi Pujan",2026-11-09,yes',
      "Bhaubeej,11-11-2026,",
    ].join("\r\n");
    const { drafts, errors } = parseHolidayCsv(csv);
    expect(errors).toEqual([]);
    expect(drafts).toEqual([
      { name: "Diwali", date: "2026-11-08", isOptional: false },
      { name: "Diwali, Lakshmi Pujan", date: "2026-11-09", isOptional: true },
      { name: "Bhaubeej", date: "2026-11-11", isOptional: false },
    ]);
  });

  it("works without a header row", () => {
    expect(parseHolidayCsv("Holi,2027-03-23,mandatory").drafts).toEqual([
      { name: "Holi", date: "2027-03-23", isOptional: false },
    ]);
  });

  it("reports line-numbered errors and never returns the bad rows", () => {
    const { drafts, errors } = parseHolidayCsv(
      ["name,date,optional", ",2026-11-08,no", "Holi,2026-02-30,no", "Diwali,2026-11-08,maybe", "Ok,2026-12-25,no"].join("\n")
    );
    expect(drafts).toEqual([{ name: "Ok", date: "2026-12-25", isOptional: false }]);
    expect(errors).toEqual([
      { line: 2, message: "Name is required" },
      { line: 3, message: "Date must be a real date (YYYY-MM-DD or DD/MM/YYYY)" },
      { line: 4, message: 'Optional must be yes or no (got "maybe")' },
    ]);
  });

  it("rejects names over 80 characters", () => {
    const { errors } = parseHolidayCsv(`${"x".repeat(81)},2026-12-25,no`);
    expect(errors).toEqual([{ line: 1, message: "Name must be 80 characters or fewer" }]);
  });

  it("skips all-empty rows (Excel ,, exports)", () => {
    const { drafts, errors } = parseHolidayCsv(
      ["name,date,optional", "Holi,2027-03-23,no", ",,", ",,,", ""].join("\r\n")
    );
    expect(errors).toEqual([]);
    expect(drafts).toEqual([{ name: "Holi", date: "2027-03-23", isOptional: false }]);
  });
});

describe("restrictToYear", () => {
  it("turns rows from other years into line errors, keeping line numbers", () => {
    const parsed = parseHolidayCsv(["name,date,optional", "A,2026-12-25,no", "B,2027-01-26,no", "bad,x,no", "C,2025-01-01,no"].join("\n"));
    const { drafts, errors } = restrictToYear(parsed, 2026);
    expect(drafts).toEqual([{ name: "A", date: "2026-12-25", isOptional: false }]);
    expect(errors).toEqual([
      { line: 3, message: "Date is in 2027; this import is for 2026" },
      { line: 4, message: "Date must be a real date (YYYY-MM-DD or DD/MM/YYYY)" },
      { line: 5, message: "Date is in 2025; this import is for 2026" },
    ]);
  });
});
