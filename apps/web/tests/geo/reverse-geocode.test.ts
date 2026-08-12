import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function mockFetchJson(json: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => json })) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.test";
  vi.resetModules();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = ORIGINAL_TOKEN;
  vi.unstubAllGlobals();
});

async function load() {
  return (await import("@/lib/geo/reverse-geocode")).reverseGeocode;
}

describe("reverseGeocode — label derivation", () => {
  it("joins a neighbourhood with its city", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        features: [
          {
            place_name: "Andheri East, Mumbai, Maharashtra, India",
            text: "Andheri East",
            place_type: ["neighborhood"],
            context: [{ id: "place.123", text: "Mumbai" }, { id: "country.1", text: "India" }],
          },
        ],
      }),
    );
    const reverseGeocode = await load();
    const r = await reverseGeocode(19.11, 72.87);
    expect(r).toMatchObject({ locality: "Andheri East", city: "Mumbai", label: "Andheri East, Mumbai" });
  });

  it("uses the city alone when the top feature IS the city", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        features: [
          {
            place_name: "Pune, Maharashtra, India",
            text: "Pune",
            place_type: ["place"],
            context: [{ id: "region.9", text: "Maharashtra" }],
          },
        ],
      }),
    );
    const reverseGeocode = await load();
    const r = await reverseGeocode(18.52, 73.85);
    expect(r).toMatchObject({ locality: null, city: "Pune", label: "Pune" });
  });

  it("falls back to the district when no place context exists", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        features: [
          {
            place_name: "Hinjawadi, Pune District, India",
            text: "Hinjawadi",
            place_type: ["locality"],
            context: [{ id: "district.4", text: "Pune District" }],
          },
        ],
      }),
    );
    const reverseGeocode = await load();
    expect((await reverseGeocode(18.59, 73.73))!.label).toBe("Hinjawadi, Pune District");
  });

  it("does not repeat a name when locality and city are identical", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchJson({
        features: [
          {
            place_name: "Kolkata, West Bengal, India",
            text: "Kolkata",
            place_type: ["locality"],
            context: [{ id: "place.7", text: "Kolkata" }],
          },
        ],
      }),
    );
    const reverseGeocode = await load();
    expect((await reverseGeocode(22.57, 88.36))!.label).toBe("Kolkata");
  });
});

describe("reverseGeocode — failure posture", () => {
  it("returns null for invalid or out-of-range coordinates without calling Mapbox", async () => {
    const fetchMock = mockFetchJson({});
    vi.stubGlobal("fetch", fetchMock);
    const reverseGeocode = await load();

    expect(await reverseGeocode(NaN, 72)).toBeNull();
    expect(await reverseGeocode(91, 0)).toBeNull();
    expect(await reverseGeocode(0, 181)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response", async () => {
    vi.stubGlobal("fetch", mockFetchJson({}, false));
    const reverseGeocode = await load();
    expect(await reverseGeocode(19.07, 72.87)).toBeNull();
  });

  it("returns null when Mapbox returns no features", async () => {
    vi.stubGlobal("fetch", mockFetchJson({ features: [] }));
    const reverseGeocode = await load();
    expect(await reverseGeocode(19.07, 72.87)).toBeNull();
  });

  it("returns null (never throws) on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
    );
    const reverseGeocode = await load();
    await expect(reverseGeocode(19.07, 72.87)).resolves.toBeNull();
  });

  it("returns null when no Mapbox token is configured", async () => {
    delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    const fetchMock = mockFetchJson({});
    vi.stubGlobal("fetch", fetchMock);
    const reverseGeocode = await load();

    expect(await reverseGeocode(19.07, 72.87)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reverseGeocode — request shape", () => {
  it("sends lng,lat in that order and asks only for coarse place types", async () => {
    const fetchMock = mockFetchJson({ features: [] });
    vi.stubGlobal("fetch", fetchMock);
    const reverseGeocode = await load();
    await reverseGeocode(19.06540, 72.86790);

    const url = String((fetchMock as any).mock.calls[0][0]);
    // Mapbox takes {longitude},{latitude} — the inverted order is the classic bug.
    expect(url).toContain("/72.86790,19.06540.json");
    // Deliberately coarse: we tag a locality, never an employee's doorstep.
    expect(url).toContain("types=neighborhood%2Clocality%2Cplace");
    // MUST NOT send `limit`: on a reverse geocode Mapbox only allows it with a
    // single `types` value and 422s otherwise, which this function would
    // swallow as "unavailable" — leaving every remote punch unlabelled.
    expect(url).not.toContain("limit=");
  });
});
