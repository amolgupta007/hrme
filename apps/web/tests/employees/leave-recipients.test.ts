import { describe, it, expect } from "vitest";
import { resolveLeaveRecipients } from "@/lib/leaves/request-recipients";

const admins = [{ id: "ad1", role: "admin", email: "admin@x.com" }];
const mgrs = [
  { id: "m1", role: "manager", email: "m1@x.com" },
  { id: "m2", role: "manager", email: "m2@x.com" },
];
const all = [...admins, ...mgrs];

describe("resolveLeaveRecipients", () => {
  it("routes to managers-of-record plus admins when managers set", () => {
    expect(resolveLeaveRecipients(["m1"], all).sort()).toEqual(["admin@x.com", "m1@x.com"]);
  });
  it("includes both managers", () => {
    expect(resolveLeaveRecipients(["m1", "m2"], all).sort()).toEqual(["admin@x.com", "m1@x.com", "m2@x.com"]);
  });
  it("falls back to everyone when no managers of record", () => {
    expect(resolveLeaveRecipients([], all).sort()).toEqual(["admin@x.com", "m1@x.com", "m2@x.com"]);
  });
  it("drops empty emails and dedupes", () => {
    const withBlank = [...all, { id: "m3", role: "manager", email: null }];
    expect(resolveLeaveRecipients(["m3"], withBlank).sort()).toEqual(["admin@x.com"]);
  });
});
