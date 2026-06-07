import { describe, it, expect, beforeEach } from "vitest";
import { listHelpArticles, getHelpArticle, clearHelpCache } from "@/lib/assistant/help";

describe("help loader", () => {
  beforeEach(() => clearHelpCache());

  it("loads all 36 help articles", () => {
    expect(listHelpArticles().length).toBe(36);
  });

  it("returns null for unknown id", () => {
    expect(getHelpArticle("not-a-real-article")).toBeNull();
  });

  it("each article has id, title, route_key, allowed_roles, plan_tier", () => {
    for (const a of listHelpArticles()) {
      expect(a.id).toBeTruthy();
      expect(a.title).toBeTruthy();
      expect(a.route_key).toBeTruthy();
      expect(Array.isArray(a.allowed_roles)).toBe(true);
      expect(a.plan_tier).toBeTruthy();
    }
  });

  it("add_employee article exposes parsed steps", () => {
    const a = getHelpArticle("add_employee");
    expect(a).not.toBeNull();
    expect(a!.steps.length).toBeGreaterThanOrEqual(3);
    expect(a!.steps[0].n).toBe(1);
  });
});
