import { describe, expect, it } from "vitest";
import { haversineMeters, isPointInGeofence } from "@/lib/geo/geometry";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters(19.07, 72.87, 19.07, 72.87)).toBe(0);
  });

  it("returns ~111 km between 1° latitude apart at equator", () => {
    const meters = haversineMeters(0, 0, 1, 0);
    expect(meters).toBeGreaterThan(110_000);
    expect(meters).toBeLessThan(112_000);
  });

  it("Mumbai (19.07, 72.87) to Pune (18.52, 73.85) is ~120 km", () => {
    const meters = haversineMeters(19.0760, 72.8777, 18.5204, 73.8567);
    expect(meters).toBeGreaterThan(115_000);
    expect(meters).toBeLessThan(125_000);
  });
});

describe("isPointInGeofence", () => {
  const office = { center_lat: 19.0760, center_lng: 72.8777, radius_m: 500 };

  it("point at center is inside", () => {
    expect(isPointInGeofence(19.0760, 72.8777, office)).toBe(true);
  });

  it("point 100 m away (inside 500 m radius) returns true", () => {
    expect(isPointInGeofence(19.0760 + 0.0009, 72.8777, office)).toBe(true);
  });

  it("point 1 km away (outside 500 m radius) returns false", () => {
    expect(isPointInGeofence(19.0760 + 0.009, 72.8777, office)).toBe(false);
  });
});
