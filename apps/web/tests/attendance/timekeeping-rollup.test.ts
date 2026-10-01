import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));

import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";

const ORG = "org-ml";
const EMP = "emp-1";
const DAY = "2026-10-01";

/** An IST wall-clock time on DAY as a UTC ISO string (matches toISOString format). */
const ist = (hhmm: string, day = DAY) => new Date(`${day}T${hhmm}:00+05:30`).toISOString();

function seed(settings: object) {
  db = {
    organizations: [{ id: ORG, settings }],
    attendance_punch_events: [],
    attendance_records: [],
    employee_zone_assignments: [],
    attendance_zone_locations: [],
    late_policies: [],
  };
}

function punch(source: string, hhmm: string, extra: object = {}) {
  db.attendance_punch_events.push({
    id: `${source}-${hhmm}`,
    org_id: ORG,
    employee_id: EMP,
    punched_at: ist(hhmm),
    location_id: source === "adms" ? "loc-office" : null,
    source,
    status: "approved",
    ...extra,
  });
}

const run = () => recomputeAttendanceDay(createFakeSupabase(db) as any, ORG, EMP, DAY);
const record = () => db.attendance_records.find((r) => r.employee_id === EMP && r.date === DAY);

const WEB_APP = { attendance: { timekeeping_source: "web_app", timekeeping_source_from: "2026-10-01" } };

beforeEach(() => seed({}));

describe("default mode (all sources) — unchanged behaviour", () => {
  it("the device badge is the clock-in; presence is also recorded", async () => {
    punch("adms", "09:05");
    punch("web", "18:00");
    await run();
    expect(record()).toMatchObject({
      clock_in_at: ist("09:05"),
      clock_out_at: ist("18:00"),
      source: "device",
      device_first_seen_at: ist("09:05"),
      device_punch_count: 1,
    });
  });
});

describe("default mode keeps first-in → last-out on multi-punch days", () => {
  it("three device badges → last one is the clock-out, gross span", async () => {
    punch("adms", "09:00");
    punch("adms", "13:00");
    punch("adms", "18:00");
    await run();
    expect(record()).toMatchObject({ clock_out_at: ist("18:00"), total_minutes: 540 });
  });
});

describe("web_app mode", () => {
  beforeEach(() => seed(WEB_APP));

  it("clock-in/out and hours come from the web; device punches are presence only", async () => {
    punch("adms", "09:05");
    punch("web", "09:40");
    punch("web", "18:30");
    punch("adms", "18:35");
    await run();
    expect(record()).toMatchObject({
      clock_in_at: ist("09:40"),
      clock_out_at: ist("18:30"),
      total_minutes: 530,
      source: "web",
      device_first_seen_at: ist("09:05"),
      device_last_seen_at: ist("18:35"),
      device_first_seen_location_id: "loc-office",
      device_punch_count: 2,
    });
  });

  it("a morning device badge no longer becomes an open clock-in (so web Clock In isn't blocked)", async () => {
    punch("adms", "09:05");
    await run();
    expect(record()).toMatchObject({ clock_in_at: null, clock_out_at: null, device_first_seen_at: ist("09:05"), source: "device" });
  });

  it("mobile-app and admin manual punches keep time like web", async () => {
    punch("mobile", "10:00");
    punch("manual", "19:00");
    punch("adms", "09:50");
    await run();
    expect(record()).toMatchObject({ clock_in_at: ist("10:00"), clock_out_at: ist("19:00"), source: "mobile" });
  });

  it("days before the switch date keep the old pooled behaviour", async () => {
    seed({ attendance: { timekeeping_source: "web_app", timekeeping_source_from: "2026-10-02" } });
    punch("adms", "09:05");
    punch("web", "18:00");
    await run();
    expect(record()!.clock_in_at).toBe(ist("09:05"));
  });

  it("pending (unapproved) device punches don't count as presence", async () => {
    punch("adms", "09:05", { status: "pending" });
    await run();
    expect(record()).toMatchObject({ device_first_seen_at: null, has_pending_punches: true });
  });

  it("clocked out, then in again → open again; hours are the closed session only", async () => {
    punch("web", "10:00");
    punch("web", "13:00");
    punch("web", "14:00");
    await run();
    expect(record()).toMatchObject({
      clock_in_at: ist("10:00"),
      clock_out_at: null,
      total_minutes: 180,
    });
  });

  it("two full sessions → closed; the break between them doesn't count", async () => {
    punch("web", "10:00");
    punch("web", "13:00");
    punch("web", "14:00");
    punch("web", "19:00");
    await run();
    expect(record()).toMatchObject({
      clock_in_at: ist("10:00"),
      clock_out_at: ist("19:00"),
      total_minutes: 480,
      worked_minutes: 480,
      break_minutes: 60,
    });
  });

  it("no punches at all → no record", async () => {
    await run();
    expect(record()).toBeUndefined();
  });
});
