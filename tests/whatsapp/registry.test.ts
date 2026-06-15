import { describe, it, expect } from "vitest";
import { resolveProvider } from "@/lib/whatsapp";

describe("resolveProvider", () => {
  it("returns null for inactive config", () => {
    expect(resolveProvider({ provider: "aisensy", apiKey: "k", endpoint: null, templateMap: {}, active: false })).toBeNull();
  });
  it("returns null for omni (not in v1)", () => {
    expect(resolveProvider({ provider: "omni", apiKey: "k", endpoint: null, templateMap: {}, active: true })).toBeNull();
  });
  it("returns an aisensy provider when active", () => {
    const p = resolveProvider({ provider: "aisensy", apiKey: "k", endpoint: null, templateMap: {}, active: true });
    expect(p?.name).toBe("aisensy");
  });
});
