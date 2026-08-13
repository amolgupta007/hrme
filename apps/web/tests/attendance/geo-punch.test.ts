import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  resolveGeoMatch,
  isValidPoint,
  normalizeLocationPunchSettings,
  DEFAULT_GEOFENCE_RADIUS_M,
  MAX_ACCURACY_SLACK_M,
  type GeofencedSite,
} from "@jambahr/shared/attendance/geo-punch";

// Two real, well-separated Mumbai points used as the office fixtures.
const BKC = { lat: 19.0654, lng: 72.8679 }; // Bandra Kurla Complex
const ANDHERI = { lat: 19.1136, lng: 72.8697 }; // Andheri East (~5.4 km north)

function site(over: Partial<GeofencedSite> = {}): GeofencedSite {
  return { id: "site-1", name: "Head Office", ...BKC, radiusM: null, ...over };
}

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(BKC, BKC)).toBe(0);
  });

  it("matches a known separation within 1%", () => {
    // BKC -> Andheri East is ~5.36 km by great circle.
    const d = haversineMeters(BKC, ANDHERI);
    expect(d).toBeGreaterThan(5_300);
    expect(d).toBeLessThan(5_450);
  });

  it("is symmetric", () => {
    expect(haversineMeters(BKC, ANDHERI)).toBeCloseTo(haversineMeters(ANDHERI, BKC), 6);
  });

  it("handles a one-degree latitude step (~111 km)", () => {
    const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it("handles the antimeridian without blowing up", () => {
    const d = haversineMeters({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 });
    // ~2.2 km apart, NOT most of the way round the planet.
    expect(d).toBeLessThan(3_000);
  });
});

describe("isValidPoint", () => {
  it("rejects missing, partial, non-finite and out-of-range points", () => {
    expect(isValidPoint(null)).toBe(false);
    expect(isValidPoint(undefined)).toBe(false);
    expect(isValidPoint({ lat: 19.06 })).toBe(false);
    expect(isValidPoint({ lat: NaN, lng: 72.8 })).toBe(false);
    expect(isValidPoint({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidPoint({ lat: 0, lng: 181 })).toBe(false);
  });

  it("accepts in-range points including the poles and null island", () => {
    expect(isValidPoint({ lat: 0, lng: 0 })).toBe(true);
    expect(isValidPoint({ lat: -90, lng: 180 })).toBe(true);
  });
});

describe("resolveGeoMatch — not evaluated", () => {
  it("returns null when there are no geofenced sites", () => {
    // The critical case: an admin who enabled the feature but has not pinned an
    // office yet must NOT have every employee labelled 'remote'.
    expect(resolveGeoMatch(BKC, [])).toBeNull();
  });

  it("returns null when the point is missing or invalid", () => {
    expect(resolveGeoMatch(null, [site()])).toBeNull();
    expect(resolveGeoMatch({ lat: 999, lng: 0 }, [site()])).toBeNull();
  });

  it("ignores sites with invalid coordinates", () => {
    const broken = site({ id: "broken", lat: NaN as unknown as number });
    expect(resolveGeoMatch(BKC, [broken])).toBeNull();
  });
});

describe("resolveGeoMatch — office vs remote", () => {
  it("marks a punch inside the default radius as office", () => {
    const m = resolveGeoMatch(BKC, [site()])!;
    expect(m.status).toBe("office");
    expect(m.matchedSiteId).toBe("site-1");
    expect(m.matchedSiteName).toBe("Head Office");
    expect(m.distanceM).toBe(0);
  });

  it("marks a punch far outside every fence as remote, with nearest distance", () => {
    const m = resolveGeoMatch(ANDHERI, [site()])!;
    expect(m.status).toBe("remote");
    expect(m.matchedSiteId).toBeNull();
    expect(m.matchedSiteName).toBeNull();
    expect(m.distanceM).toBeGreaterThan(5_000);
  });

  it("respects a per-site radius override over the org default", () => {
    // ~5.36 km away: remote at the 200m default, office at a 6 km campus fence.
    expect(resolveGeoMatch(ANDHERI, [site()])!.status).toBe("remote");
    expect(resolveGeoMatch(ANDHERI, [site({ radiusM: 6_000 })])!.status).toBe("office");
  });

  it("uses the supplied org default radius when a site has no override", () => {
    expect(
      resolveGeoMatch(ANDHERI, [site()], { defaultRadiusM: 6_000 })!.status,
    ).toBe("office");
  });

  it("falls back to the built-in default for a zero/negative radius", () => {
    const m = resolveGeoMatch(ANDHERI, [site({ radiusM: 0 })], {
      defaultRadiusM: 0,
    })!;
    expect(m.status).toBe("remote");
    expect(DEFAULT_GEOFENCE_RADIUS_M).toBe(200);
  });
});

describe("resolveGeoMatch — accuracy slack", () => {
  // A point ~250m north of the office: outside a 200m fence on paper.
  const justOutside = { lat: BKC.lat + 0.00225, lng: BKC.lng };

  it("is remote with a confident fix", () => {
    const m = resolveGeoMatch(justOutside, [site()], { accuracyM: 5 })!;
    expect(m.status).toBe("remote");
    expect(m.distanceM).toBeGreaterThan(200);
  });

  it("is office when the reported accuracy plausibly covers the gap", () => {
    expect(resolveGeoMatch(justOutside, [site()], { accuracyM: 80 })!.status).toBe(
      "office",
    );
  });

  it("caps the slack so a garbage fix cannot swallow the city", () => {
    // ±5 km accuracy must not turn a 5.36 km-away punch into 'office'.
    expect(resolveGeoMatch(ANDHERI, [site()], { accuracyM: 5_000 })!.status).toBe(
      "remote",
    );
    expect(MAX_ACCURACY_SLACK_M).toBe(100);
  });

  it("treats negative or non-finite accuracy as no slack", () => {
    expect(resolveGeoMatch(justOutside, [site()], { accuracyM: -50 })!.status).toBe(
      "remote",
    );
    expect(resolveGeoMatch(justOutside, [site()], { accuracyM: NaN })!.status).toBe(
      "remote",
    );
    expect(resolveGeoMatch(justOutside, [site()], { accuracyM: null })!.status).toBe(
      "remote",
    );
  });
});

describe("resolveGeoMatch — multiple sites", () => {
  const sites: GeofencedSite[] = [
    site({ id: "campus", name: "Campus", radiusM: 8_000 }),
    site({ id: "building", name: "Andheri Building", ...ANDHERI, radiusM: 300 }),
  ];

  it("picks the nearest matching fence when fences overlap", () => {
    // Inside the big campus fence AND the small building fence -> building wins.
    const m = resolveGeoMatch(ANDHERI, sites)!;
    expect(m.status).toBe("office");
    expect(m.matchedSiteId).toBe("building");
  });

  it("falls back to the wider fence when only it contains the point", () => {
    const between = { lat: 19.09, lng: 72.868 };
    const m = resolveGeoMatch(between, sites)!;
    expect(m.status).toBe("office");
    expect(m.matchedSiteId).toBe("campus");
  });

  it("reports the nearest site's distance when remote", () => {
    const far = { lat: 18.52, lng: 73.85 }; // Pune, ~120 km away
    const m = resolveGeoMatch(far, sites)!;
    expect(m.status).toBe("remote");
    expect(m.distanceM).toBeGreaterThan(100_000);
  });
});

describe("normalizeLocationPunchSettings", () => {
  it("defaults to disabled for missing or malformed input", () => {
    for (const raw of [null, undefined, 42, "on", []]) {
      const s = normalizeLocationPunchSettings(raw);
      expect(s.enabled).toBe(false);
      expect(s.mode).toBe("optional");
      expect(s.defaultRadiusM).toBe(DEFAULT_GEOFENCE_RADIUS_M);
    }
  });

  it("only treats a literal true as enabled", () => {
    expect(normalizeLocationPunchSettings({ enabled: true }).enabled).toBe(true);
    expect(normalizeLocationPunchSettings({ enabled: "true" }).enabled).toBe(false);
    expect(normalizeLocationPunchSettings({ enabled: 1 }).enabled).toBe(false);
  });

  it("only accepts 'required' as the strict mode", () => {
    expect(normalizeLocationPunchSettings({ mode: "required" }).mode).toBe("required");
    expect(normalizeLocationPunchSettings({ mode: "REQUIRED" }).mode).toBe("optional");
    expect(normalizeLocationPunchSettings({ mode: "strict" }).mode).toBe("optional");
  });

  it("clamps an out-of-range radius back to the default", () => {
    expect(normalizeLocationPunchSettings({ default_radius_m: 5 }).defaultRadiusM).toBe(200);
    expect(normalizeLocationPunchSettings({ default_radius_m: 1e9 }).defaultRadiusM).toBe(200);
    expect(normalizeLocationPunchSettings({ default_radius_m: 500 }).defaultRadiusM).toBe(500);
  });

  it("accepts the camelCase key as well as the stored snake_case one", () => {
    expect(normalizeLocationPunchSettings({ defaultRadiusM: 350 }).defaultRadiusM).toBe(350);
  });
});
