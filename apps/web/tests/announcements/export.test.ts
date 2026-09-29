import { describe, it, expect } from "vitest";
import { buildAckCsv, csvCell } from "@/lib/announcements/export";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });
  it("neutralises formula injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+91 98")).toBe("'+91 98");
    expect(csvCell("@x")).toBe("'@x");
  });
  it("leaves plain values alone", () => {
    expect(csvCell("Priya")).toBe("Priya");
    expect(csvCell(3)).toBe("3");
    expect(csvCell(null)).toBe("");
  });
});

describe("buildAckCsv", () => {
  it("renders a header plus one IST-formatted row per person", () => {
    const csv = buildAckCsv([
      {
        name: "Priya S",
        email: "p@x.test",
        department: "Engineering",
        state: "acknowledged",
        acknowledged_at: "2026-09-30T04:30:00Z",
        last_reminded_at: null,
        reminder_count: 0,
      },
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("Name,Email,Department,Status,Acknowledged at (IST),Last reminded (IST),Reminders sent");
    expect(row).toContain("Priya S,p@x.test,Engineering,Acknowledged,");
    expect(row).toContain("10:00"); // 04:30 UTC = 10:00 IST
    expect(row.endsWith(",,0")).toBe(true);
  });
});
