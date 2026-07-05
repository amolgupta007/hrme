import { describe, it, expect } from "vitest";
import { parseAttlog, istLocalToUtcIso, istDateOf } from "@/lib/attendance/adms-ingest";

describe("parseAttlog", () => {
  it("parses a real ZKTeco K40 Pro ATTLOG line (tab-separated, trailing fields)", () => {
    const body = "1\t2026-06-24 13:38:28\t0\t1\t0\t0\t0\t0\t0\t0\t";
    const out = parseAttlog(body);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      pin: "1",
      localDateTime: "2026-06-24 13:38:28",
      status: "0",
      verify: "1",
    });
  });

  it("parses multiple lines and tolerates CRLF + blank lines", () => {
    const body = "1\t2026-06-24 09:00:00\t0\t1\r\n\n2\t2026-06-24 18:00:00\t1\t1\r\n";
    const out = parseAttlog(body);
    expect(out.map((p) => p.pin)).toEqual(["1", "2"]);
  });

  it("drops malformed lines (missing timestamp)", () => {
    expect(parseAttlog("1\n")).toHaveLength(0);
    expect(parseAttlog("")).toHaveLength(0);
  });
});

describe("istLocalToUtcIso", () => {
  it("treats the device-local timestamp as IST and converts to UTC", () => {
    // 13:38:28 IST = 08:08:28 UTC
    expect(istLocalToUtcIso("2026-06-24 13:38:28")).toBe("2026-06-24T08:08:28.000Z");
  });

  it("handles the IST->UTC date rollover before 05:30", () => {
    // 02:00 IST = 20:30 UTC the previous day
    expect(istLocalToUtcIso("2026-06-24 02:00:00")).toBe("2026-06-23T20:30:00.000Z");
  });

  it("returns null for unparseable input", () => {
    expect(istLocalToUtcIso("not a date")).toBeNull();
    expect(istLocalToUtcIso("2026/06/24 13:38")).toBeNull();
  });
});

describe("istDateOf", () => {
  it("returns the IST calendar date (the device-local date part)", () => {
    expect(istDateOf("2026-06-24 13:38:28")).toBe("2026-06-24");
  });
  it("returns null when there is no date", () => {
    expect(istDateOf("garbage")).toBeNull();
  });
});
