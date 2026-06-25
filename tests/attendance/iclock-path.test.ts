import { describe, it, expect } from "vitest";
import { parseIclockPath } from "@/lib/attendance/iclock-path";

describe("parseIclockPath", () => {
  it("treats a known ADMS verb as the endpoint (legacy, no token)", () => {
    expect(parseIclockPath(["cdata"])).toEqual({ token: null, endpoint: "cdata", rest: [] });
    expect(parseIclockPath(["getrequest"])).toEqual({
      token: null,
      endpoint: "getrequest",
      rest: [],
    });
  });

  it("treats a non-verb first segment as the ingest token", () => {
    expect(parseIclockPath(["abc123token", "cdata"])).toEqual({
      token: "abc123token",
      endpoint: "cdata",
      rest: [],
    });
  });

  it("is case-insensitive on the verb but preserves token casing", () => {
    expect(parseIclockPath(["CData"])).toEqual({ token: null, endpoint: "CData", rest: [] });
    expect(parseIclockPath(["AbC", "getrequest"]).token).toBe("AbC");
  });

  it("handles a token with no endpoint", () => {
    expect(parseIclockPath(["tok"])).toEqual({ token: "tok", endpoint: "", rest: [] });
  });

  it("handles empty segments", () => {
    expect(parseIclockPath([])).toEqual({ token: null, endpoint: "", rest: [] });
  });
});
