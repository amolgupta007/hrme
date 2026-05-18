import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { ROUTE_REGISTRY } from "@/lib/assistant/route-registry";

const APP_DIR = path.resolve(__dirname, "../../src/app");

function pathToPageFile(routePath: string): string {
  const trimmed = routePath.replace(/^\/+/, "");
  return path.join(APP_DIR, trimmed, "page.tsx");
}

describe("ROUTE_REGISTRY integrity", () => {
  it("every registered route resolves to a real page.tsx", () => {
    for (const [key, entry] of Object.entries(ROUTE_REGISTRY)) {
      const file = pathToPageFile(entry.path);
      expect(
        existsSync(file),
        `Route '${key}' points to ${entry.path} but ${file} does not exist`
      ).toBe(true);
    }
  });

  it("registry is non-empty by Phase 1 (skipped in Phase 0)", () => {
    if (process.env.ASSISTANT_PHASE === "0") {
      expect(Object.keys(ROUTE_REGISTRY).length).toBe(0);
    } else {
      expect(Object.keys(ROUTE_REGISTRY).length).toBeGreaterThan(0);
    }
  });
});
