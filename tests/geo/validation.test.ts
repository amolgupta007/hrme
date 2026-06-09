import { describe, expect, it } from "vitest";
import { GeofenceCreateSchema } from "@/lib/geo/geo-schemas";

describe("GeofenceCreateSchema", () => {
  const valid = {
    name: "Mumbai HQ",
    type: "office" as const,
    center_lat: 19.0760,
    center_lng: 72.8777,
    radius_m: 500,
  };

  it("accepts a valid geofence", () => {
    expect(() => GeofenceCreateSchema.parse(valid)).not.toThrow();
  });

  it("rejects lat > 90", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, center_lat: 91 })).toThrow();
  });

  it("rejects lng > 180", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, center_lng: 181 })).toThrow();
  });

  it("rejects radius < 1", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, radius_m: 0 })).toThrow();
  });

  it("rejects radius > 5000", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, radius_m: 5001 })).toThrow();
  });

  it("rejects unknown type", () => {
    expect(() => GeofenceCreateSchema.parse({ ...valid, type: "warehouse" })).toThrow();
  });
});
