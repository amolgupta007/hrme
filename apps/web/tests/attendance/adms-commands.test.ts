import { describe, it, expect } from "vitest";
import {
  sanitizeName,
  isValidPin,
  buildUserCommand,
  buildDeleteCommand,
  parseDeviceCmdAck,
  parseDeviceCmdAcks,
} from "@/lib/attendance/adms-commands";

describe("sanitizeName", () => {
  it("strips tabs/newlines that would break the wire format", () => {
    expect(sanitizeName("John\tDoe\n")).toBe("John Doe");
  });
  it("truncates to 24 chars", () => {
    expect(sanitizeName("A".repeat(40))).toBe("A".repeat(24));
  });
});

describe("isValidPin", () => {
  it("accepts numeric", () => expect(isValidPin("1042")).toBe(true));
  it("rejects non-numeric", () => expect(isValidPin("A12")).toBe(false));
  it("rejects empty", () => expect(isValidPin("")).toBe(false));
});

describe("buildUserCommand", () => {
  it("builds a tab-separated USERINFO update line", () => {
    expect(buildUserCommand({ cmdSeq: 7, pin: "1042", name: "John Doe" })).toBe(
      "C:7:DATA UPDATE USERINFO PIN=1042\tName=John Doe\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ="
    );
  });
  it("sanitizes the name", () => {
    expect(buildUserCommand({ cmdSeq: 1, pin: "5", name: "a\tb" })).toContain("Name=a b\t");
  });
});

describe("buildDeleteCommand", () => {
  it("builds a USERINFO delete line", () => {
    expect(buildDeleteCommand(9, "1042")).toBe("C:9:DATA DELETE USERINFO PIN=1042");
  });
});

describe("parseDeviceCmdAck", () => {
  it("parses ID and Return", () => {
    expect(parseDeviceCmdAck("ID=7&Return=0&CMD=DATA")).toEqual({
      id: 7,
      ret: 0,
      raw: "ID=7&Return=0&CMD=DATA",
    });
  });
  it("parses negative return", () => {
    expect(parseDeviceCmdAck("ID=7&Return=-1&CMD=DATA").ret).toBe(-1);
  });
  it("returns nulls when fields absent", () => {
    expect(parseDeviceCmdAck("garbage")).toEqual({ id: null, ret: null, raw: "garbage" });
  });
});

describe("parseDeviceCmdAcks (batched)", () => {
  it("parses a multi-line eSSL batch, one ack per line", () => {
    const body = "ID=394&Return=0&CMD=DATA\nID=395&Return=0&CMD=DATA\nID=396&Return=-1&CMD=DATA";
    expect(parseDeviceCmdAcks(body)).toEqual([
      { id: 394, ret: 0 },
      { id: 395, ret: 0 },
      { id: 396, ret: -1 },
    ]);
  });
  it("handles a single-ack body (ZKTeco style)", () => {
    expect(parseDeviceCmdAcks("ID=7&Return=0&CMD=DATA")).toEqual([{ id: 7, ret: 0 }]);
  });
  it("skips lines without an ID and handles CRLF", () => {
    expect(parseDeviceCmdAcks("garbage\r\nID=3&Return=0\r\n\r\n")).toEqual([{ id: 3, ret: 0 }]);
  });
  it("returns empty for empty body", () => {
    expect(parseDeviceCmdAcks("")).toEqual([]);
  });
});
