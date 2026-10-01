import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeSupabase, type FakeDb } from "../helpers/fake-supabase";

let db: FakeDb;
vi.mock("@/lib/supabase/server", () => ({ createAdminSupabase: () => createFakeSupabase(db) }));
vi.mock("@vercel/functions", () => ({ waitUntil: (p: Promise<unknown>) => p }));

import { GET } from "@/app/api/cron/attendance-auto-clockout/route";
import { recomputeAttendanceDay } from "@/lib/attendance/adms-ingest";

const ORG = "org-ml";
const EMP = "emp-1";
const DAY = "2026-09-29"; // a past IST day, so the cron treats it as forgotten
const ist = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+05:30`).toISOString();

function seed(times: string[]) {
  db = {
    organizations: [
      {
        id: ORG,
        settings: {
          attendance_enabled: true,
          attendance: {
            standard_workday_hours: 9,
            timekeeping_source: "web_app",
            timekeeping_source_from: "2026-09-01",
          },
        },
      },
    ],
    attendance_punch_events: times.map((t) => ({
      id: `web-${t}`,
      org_id: ORG,
      employee_id: EMP,
      punched_at: ist(t),
      location_id: null,
      source: "web",
      status: "approved",
    })),
    attendance_records: [],
    employee_zone_assignments: [],
    attendance_zone_locations: [],
    late_policies: [],
    shifts: [],
  };
}

const run = () =>
  GET(new Request("http://x/api/cron", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
const record = () => db.attendance_records.find((r) => r.employee_id === EMP && r.date === DAY);
const lastPunch = () =>
  [...db.attendance_punch_events].sort((a, b) => a.punched_at.localeCompare(b.punched_at)).at(-1);

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
});

describe("auto clock-out on a multi-session day", () => {
  it("closes the open second session at first clock-in + shift hours", async () => {
    seed(["10:00", "13:00", "14:00"]);
    await recomputeAttendanceDay(createFakeSupabase(db) as any, ORG, EMP, DAY);
    expect(record()!.clock_out_at).toBeNull();

    await run();

    expect(lastPunch()!.punched_at).toBe(ist("19:00"));
    expect(record()).toMatchObject({
      clock_in_at: ist("10:00"),
      clock_out_at: ist("19:00"),
      total_minutes: 180 + 300, // 10–13 + 14–19; the 13–14 break doesn't count
      auto_closed: true,
    });
  });

  it("never closes before the last clock-in — 2 minutes after it instead", async () => {
    seed(["10:00", "18:00", "20:30"]);
    await recomputeAttendanceDay(createFakeSupabase(db) as any, ORG, EMP, DAY);

    await run();

    expect(record()).toMatchObject({
      clock_out_at: ist("20:32"),
      total_minutes: 480 + 2,
      auto_closed: true,
    });
  });
});
