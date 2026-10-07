import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let db: FakeDb;
// When set, every query on the `holidays` table resolves with a DB error.
let failHolidays = false;
function failingHolidaysClient() {
  const real = createFakeSupabase(db);
  return {
    from: (t: string) => {
      if (t !== "holidays") return real.from(t);
      const chain: any = new Proxy({}, {
        get: (_x, p) => {
          if (p === "then") return (res: any) => Promise.resolve({ data: null, error: { message: "boom" } }).then(res);
          if (p === "single" || p === "maybeSingle") return () => Promise.resolve({ data: null, error: { message: "boom" } });
          return () => chain;
        },
      });
      return chain;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => (failHolidays ? failingHolidaysClient() : createFakeSupabase(db)),
}));

let currentUser: any;
const asUser = (orgId: string, employeeId: string, role: string) => {
  currentUser = { orgId, employeeId, role, clerkUserId: `clerk-${employeeId}` };
};
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
  isAdmin: (role: string) => role === "owner" || role === "admin",
  isManagerOrAbove: (role: string) => ["owner", "admin", "manager"].includes(role),
}));

import {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  getHolidayPreset,
  importHolidays,
} from "../../src/actions/holidays";

const H = (id: string, org_id: string, date: string, name: string, is_optional = false) => ({
  id, org_id, date, name, is_optional, source: "seed", created_by: null,
});

beforeEach(() => {
  failHolidays = false;
  db = {
    holidays: [
      H("h1", "A", "2026-11-08", "Diwali"),
      H("h2", "A", "2027-01-26", "Republic Day"),
      H("h3", "B", "2026-11-10", "Other org"),
    ],
  };
  asUser("A", "admin-a", "admin");
});

describe("listHolidays", () => {
  it("returns only the caller's org and the requested year, for any role", async () => {
    asUser("A", "emp-a", "employee");
    const res = await listHolidays(2026);
    expect(res).toEqual({ success: true, data: [{ id: "h1", name: "Diwali", date: "2026-11-08", is_optional: false, source: "seed" }] });
  });
  it("rejects a signed-out caller", async () => {
    currentUser = null;
    expect(await listHolidays(2026)).toEqual({ success: false, error: "Not authenticated" });
  });
});

describe("createHoliday", () => {
  it("admin adds a manual holiday stamped with created_by", async () => {
    const res = await createHoliday({ name: "  Bhaubeej ", date: "2026-11-11", isOptional: false });
    expect(res.success).toBe(true);
    const row = db.holidays.find((h) => h.date === "2026-11-11")!;
    expect(row).toMatchObject({ org_id: "A", name: "Bhaubeej", source: "manual", created_by: "admin-a" });
  });
  it("a clash returns a friendly message", async () => {
    const res = await createHoliday({ name: "Lakshmi Pujan", date: "2026-11-08", isOptional: false });
    expect(res).toEqual({ success: false, error: "There's already a holiday on 8 Nov 2026" });
  });
  it("employees and managers can't add", async () => {
    asUser("A", "mgr-a", "manager");
    expect(await createHoliday({ name: "X", date: "2026-12-01", isOptional: false })).toEqual({ success: false, error: "Unauthorized" });
  });
  it("validates name and date", async () => {
    expect((await createHoliday({ name: "", date: "2026-12-01", isOptional: false })).success).toBe(false);
    expect((await createHoliday({ name: "X", date: "2026-02-30", isOptional: false })).success).toBe(false);
  });
});

describe("updateHoliday / deleteHoliday", () => {
  it("updates the caller's own row", async () => {
    expect(await updateHoliday("h1", { name: "Diwali (Laxmi Pujan)", date: "2026-11-08", isOptional: false })).toEqual({ success: true, data: undefined });
    expect(db.holidays.find((h) => h.id === "h1")!.name).toBe("Diwali (Laxmi Pujan)");
  });
  it("another org's id is 'not found' and nothing changes", async () => {
    expect(await updateHoliday("h3", { name: "Hacked", date: "2026-11-10", isOptional: false })).toEqual({ success: false, error: "Holiday not found" });
    expect(await deleteHoliday("h3")).toEqual({ success: false, error: "Holiday not found" });
    expect(db.holidays.find((h) => h.id === "h3")!.name).toBe("Other org");
  });
  it("moving onto an existing date is a friendly clash", async () => {
    db.holidays.push(H("h4", "A", "2026-12-25", "Christmas"));
    expect(await updateHoliday("h4", { name: "Christmas", date: "2026-11-08", isOptional: false })).toEqual({
      success: false,
      error: "There's already a holiday on 8 Nov 2026",
    });
  });
  it("deletes the caller's own row; employees can't", async () => {
    asUser("A", "emp-a", "employee");
    expect(await deleteHoliday("h1")).toEqual({ success: false, error: "Unauthorized" });
    asUser("A", "admin-a", "admin");
    expect(await deleteHoliday("h1")).toEqual({ success: true, data: undefined });
    expect(db.holidays.some((h) => h.id === "h1")).toBe(false);
  });
});

describe("getHolidayPreset", () => {
  it("marks dates the org already has", async () => {
    const res = await getHolidayPreset(2026, "national");
    if (!res.success) throw new Error(res.error);
    expect(res.data.find((r) => r.name === "Diwali")!.alreadyAdded).toBe(true);
    expect(res.data.find((r) => r.name === "Christmas Day")!.alreadyAdded).toBe(false);
  });
  it("is admin-only", async () => {
    asUser("A", "emp-a", "employee");
    expect(await getHolidayPreset(2026, "national")).toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("importHolidays", () => {
  it("merges same-date entries, skips existing dates, stamps source", async () => {
    const res = await importHolidays(
      [
        { name: "Independence Day", date: "2027-08-15", isOptional: false },
        { name: "Milad-un-Nabi", date: "2027-08-15", isOptional: false },
        { name: "Republic Day", date: "2027-01-26", isOptional: false }, // already there
      ],
      "preset"
    );
    expect(res).toEqual({ success: true, data: { added: 1, skipped: ["2027-01-26"] } });
    expect(db.holidays.find((h) => h.date === "2027-08-15")).toMatchObject({
      org_id: "A",
      name: "Independence Day / Milad-un-Nabi",
      source: "preset",
      created_by: "admin-a",
    });
  });
  it("rejects invalid drafts before writing anything", async () => {
    const before = db.holidays.length;
    const res = await importHolidays([{ name: "X", date: "bad", isOptional: false }], "csv");
    expect(res.success).toBe(false);
    expect(db.holidays.length).toBe(before);
  });
  it("is admin-only", async () => {
    asUser("A", "emp-a", "employee");
    expect(await importHolidays([], "csv")).toEqual({ success: false, error: "Unauthorized" });
  });
});

describe("failed reads never read as 'no data' (gotcha #102)", () => {
  it("listHolidays", async () => {
    failHolidays = true;
    expect(await listHolidays(2026)).toEqual({ success: false, error: "Couldn't load holidays" });
  });
  it("deleteHoliday reports a failed delete, not 'not found'", async () => {
    failHolidays = true;
    expect(await deleteHoliday("h1")).toEqual({ success: false, error: "Couldn't delete the holiday" });
    failHolidays = false;
    expect(db.holidays.some((h) => h.id === "h1")).toBe(true);
  });
  it("updateHoliday's clash pre-check error is not ignored", async () => {
    failHolidays = true;
    expect(await updateHoliday("h1", { name: "X", date: "2026-11-09", isOptional: false })).toEqual({
      success: false, error: "Couldn't save the holiday",
    });
    failHolidays = false;
    expect(db.holidays.find((h) => h.id === "h1")!.name).toBe("Diwali");
  });
  it("getHolidayPreset", async () => {
    failHolidays = true;
    expect(await getHolidayPreset(2026, "national")).toEqual({ success: false, error: "Couldn't load your holidays" });
  });
  it("importHolidays", async () => {
    failHolidays = true;
    expect(await importHolidays([{ name: "X", date: "2026-12-01", isOptional: false }], "csv")).toEqual({
      success: false, error: "Couldn't load your holidays",
    });
    failHolidays = false;
    expect(db.holidays.length).toBe(3);
  });
});

describe("gating, scoping and validation", () => {
  it("employee can't update", async () => {
    asUser("A", "emp-a", "employee");
    expect(await updateHoliday("h1", { name: "X", date: "2026-11-08", isOptional: false })).toEqual({ success: false, error: "Unauthorized" });
  });
  it("preset: another org's date is not 'alreadyAdded'; import adds it", async () => {
    const res = await getHolidayPreset(2026, "national");
    if (!res.success) throw new Error(res.error);
    expect(res.data.filter((r) => r.date === "2026-11-10").every((r) => !r.alreadyAdded)).toBe(true);
    const imp = await importHolidays([{ name: "Mine", date: "2026-11-10", isOptional: false }], "csv");
    expect(imp).toEqual({ success: true, data: { added: 1, skipped: [] } });
  });
  it("importHolidays validates source at runtime", async () => {
    const res = await importHolidays([{ name: "X", date: "2026-12-01", isOptional: false }], "bogus" as any);
    expect(res.success).toBe(false);
    expect(db.holidays.length).toBe(3);
  });
  it("rejects dates outside 2000-2100", async () => {
    const res = await createHoliday({ name: "X", date: "2101-01-01", isOptional: false });
    expect(res).toEqual({ success: false, error: "Enter a date between 2000 and 2100" });
  });
});
