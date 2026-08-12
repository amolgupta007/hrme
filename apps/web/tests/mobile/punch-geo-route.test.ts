import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Route-level tests for Location-verified clock-in (Mobile D5).
 *
 * The invariant under test throughout: **a punch is never lost to location**.
 * Geocoder down, settings unreadable, no geofences configured — the punch still
 * records; only the label is missing. The one exception is `required` mode with
 * no coordinates, which is an explicit admin choice and is rejected BEFORE any
 * write.
 */

// ── mutable mock state ──────────────────────────────────────────────────────
let clerkUserId: string | null = "clerk_1";
let currentUser: any = null;
/** organizations.settings returned by the settings read. */
let orgSettings: any = {};
/** Rows the `locations` table yields (already filtered to geofenced+active). */
let locationRows: any[] = [];
/** Forced error for the organizations read (degrade-to-off path). */
let orgReadError: any = null;
let reverseGeocodeImpl: (lat: number, lng: number) => Promise<any> = async () => null;
let insertError: any = null;

const inserts: any[] = [];
const recomputeCalls: any[] = [];

function makeChain(table: string) {
  const chain: any = {
    _table: table,
    insert: (payload: any) => {
      inserts.push({ table, payload });
      return Promise.resolve({ data: null, error: insertError });
    },
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    lt: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => {
      if (table === "organizations") {
        return Promise.resolve(
          orgReadError
            ? { data: null, error: orgReadError }
            : { data: { settings: orgSettings }, error: null },
        );
      }
      if (table === "employees") {
        return Promise.resolve({ data: { status: "active" }, error: null });
      }
      // attendance_punch_events (last-geo lookup) / attendance_records
      return Promise.resolve({ data: null, error: null });
    },
    // Terminal await for non-maybeSingle selects (locations).
    then: (resolve: (v: any) => any) => {
      if (table === "locations") return resolve({ data: locationRows, error: null });
      return resolve({ data: [], error: null });
    },
  };
  return chain;
}

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: clerkUserId }) }));
vi.mock("@/lib/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser),
}));
vi.mock("@/lib/supabase/server", () => ({
  createAdminSupabase: () => ({ from: (t: string) => makeChain(t) }),
}));
vi.mock("@/lib/attendance/adms-ingest", () => ({
  recomputeAttendanceDay: vi.fn(async (...args: any[]) => {
    recomputeCalls.push(args);
  }),
}));
vi.mock("@/lib/mobile/attendance-queries", () => ({
  loadTodayStatus: vi.fn(async () => ({
    isClockedIn: true,
    clockInAt: "2026-08-12T04:00:00.000Z",
    clockOutAt: null,
    minutesToday: null,
    shift: null,
    lastPunchGeo: null,
  })),
}));
vi.mock("@/lib/geo/reverse-geocode", () => ({
  reverseGeocode: (lat: number, lng: number) => reverseGeocodeImpl(lat, lng),
}));

import { POST } from "@/app/api/mobile/attendance/punch/route";

// Bandra Kurla Complex — the office fixture.
const BKC = { lat: 19.0654, lng: 72.8679 };
// Pune, ~120 km away — unambiguously off-site.
const FAR = { lat: 18.5204, lng: 73.8567 };

const OFFICE_ROW = {
  id: "loc-1",
  name: "Head Office",
  lat: BKC.lat,
  lng: BKC.lng,
  geofence_radius_m: 200,
};

function punchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/mobile/attendance/punch", {
    method: "POST",
    body: JSON.stringify({
      clientEventId: "b3f1c2de-0000-4000-8000-000000000001",
      punchedAt: new Date().toISOString(),
      ...body,
    }),
    headers: { "x-org-id": "org-1" },
  }) as any;
}

function lastPunchInsert() {
  const row = inserts.find((i) => i.table === "attendance_punch_events");
  return row?.payload as Record<string, unknown> | undefined;
}

function enableFeature(over: Record<string, unknown> = {}) {
  orgSettings = {
    attendance: { location_punch: { enabled: true, mode: "optional", default_radius_m: 200, ...over } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clerkUserId = "clerk_1";
  currentUser = {
    orgId: "org-1",
    orgName: "Acme",
    role: "employee",
    plan: "business",
    employeeId: "emp-1",
    attendanceEnabled: true,
  };
  orgSettings = {};
  orgReadError = null;
  locationRows = [];
  insertError = null;
  reverseGeocodeImpl = async () => null;
  inserts.length = 0;
  recomputeCalls.length = 0;
});

describe("punch route — feature disabled", () => {
  it("records the punch with no location verdict at all", async () => {
    const res = await POST(punchRequest({ ...BKC, accuracyM: 10 }));
    expect(res.status).toBe(200);

    const row = lastPunchInsert()!;
    expect(row.geo_status).toBeNull();
    expect(row.matched_location_id).toBeNull();
    expect(row.geo_label).toBeNull();
    // Raw coordinates are still stored (migration 102 columns) — only the
    // verdict is withheld.
    expect(row.lat).toBe(BKC.lat);
  });

  it("does not reject a coordinate-free punch", async () => {
    const res = await POST(punchRequest({}));
    expect(res.status).toBe(200);
  });
});

describe("punch route — optional mode", () => {
  beforeEach(() => enableFeature());

  it("marks a punch inside the office geofence as 'office' with the site name", async () => {
    locationRows = [OFFICE_ROW];
    const res = await POST(punchRequest({ ...BKC, accuracyM: 8 }));
    expect(res.status).toBe(200);

    const row = lastPunchInsert()!;
    expect(row.geo_status).toBe("office");
    expect(row.matched_location_id).toBe("loc-1");
    expect(row.geo_label).toBe("Head Office");
    expect(row.accuracy_m).toBe(8);
  });

  it("marks an off-site punch as 'remote' with the reverse-geocoded locality", async () => {
    locationRows = [OFFICE_ROW];
    reverseGeocodeImpl = async () => ({
      locality: "Shivajinagar",
      city: "Pune",
      placeName: "Shivajinagar, Pune, Maharashtra, India",
      label: "Shivajinagar, Pune",
    });

    await POST(punchRequest({ ...FAR, accuracyM: 15 }));

    const row = lastPunchInsert()!;
    expect(row.geo_status).toBe("remote");
    expect(row.matched_location_id).toBeNull();
    expect(row.geo_label).toBe("Shivajinagar, Pune");
  });

  it("still marks 'remote' when the geocoder returns nothing", async () => {
    locationRows = [OFFICE_ROW];
    reverseGeocodeImpl = async () => null;

    await POST(punchRequest(FAR));

    const row = lastPunchInsert()!;
    expect(row.geo_status).toBe("remote");
    expect(row.geo_label).toBeNull();
  });

  it("records the punch even if the geocoder throws", async () => {
    locationRows = [OFFICE_ROW];
    reverseGeocodeImpl = async () => {
      throw new Error("mapbox exploded");
    };

    const res = await POST(punchRequest(FAR));
    // The whole point: a third-party outage costs a label, not a clock-in.
    expect(res.status).toBe(200);
    const row = lastPunchInsert()!;
    expect(row.geo_status).toBeNull();
  });

  it("leaves the verdict unevaluated when the org has no geofences yet", async () => {
    locationRows = [];
    await POST(punchRequest(BKC));

    const row = lastPunchInsert()!;
    // NOT 'remote' — an admin who hasn't pinned an office yet must not have
    // every employee labelled off-site.
    expect(row.geo_status).toBeNull();
    expect(row.geo_label).toBeNull();
  });

  it("accepts a punch with no coordinates and leaves it unevaluated", async () => {
    locationRows = [OFFICE_ROW];
    const res = await POST(punchRequest({}));
    expect(res.status).toBe(200);
    expect(lastPunchInsert()!.geo_status).toBeNull();
  });

  it("degrades to feature-off when the settings read fails", async () => {
    orgReadError = { message: "boom" };
    locationRows = [OFFICE_ROW];

    const res = await POST(punchRequest(BKC));
    expect(res.status).toBe(200);
    expect(lastPunchInsert()!.geo_status).toBeNull();
  });
});

describe("punch route — required mode", () => {
  beforeEach(() => enableFeature({ mode: "required" }));

  it("rejects a punch with no coordinates and writes nothing", async () => {
    const res = await POST(punchRequest({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "location_required" });
    expect(inserts).toHaveLength(0);
    expect(recomputeCalls).toHaveLength(0);
  });

  it("rejects when only one of lat/lng is supplied", async () => {
    const res = await POST(punchRequest({ lat: BKC.lat }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "location_required" });
  });

  it("accepts a punch with coordinates", async () => {
    locationRows = [OFFICE_ROW];
    const res = await POST(punchRequest(BKC));
    expect(res.status).toBe(200);
    expect(lastPunchInsert()!.geo_status).toBe("office");
  });
});

describe("punch route — offline replay", () => {
  beforeEach(() => enableFeature());

  it("treats a duplicate clientEventId as success without overwriting the stored verdict", async () => {
    locationRows = [OFFICE_ROW];
    // 23505 = the unique index on (org_id, client_event_id).
    insertError = { code: "23505", message: "duplicate key" };

    const res = await POST(punchRequest(BKC));
    expect(res.status).toBe(200);
    // The insert was attempted and conflicted; no UPDATE follows it, so the
    // originally-stored verdict (resolved where the punch really happened)
    // survives the replay.
    expect(inserts).toHaveLength(1);
    expect(recomputeCalls).toHaveLength(1);
  });

  it("surfaces a genuine insert failure as a 500", async () => {
    insertError = { code: "23503", message: "fk violation" };
    const res = await POST(punchRequest(BKC));
    expect(res.status).toBe(500);
  });
});

describe("punch route — validation", () => {
  it("rejects an out-of-range accuracy", async () => {
    enableFeature();
    const res = await POST(punchRequest({ ...BKC, accuracyM: 1e9 }));
    expect(res.status).toBe(400);
  });

  it("rejects a negative accuracy", async () => {
    enableFeature();
    const res = await POST(punchRequest({ ...BKC, accuracyM: -1 }));
    expect(res.status).toBe(400);
  });
});
