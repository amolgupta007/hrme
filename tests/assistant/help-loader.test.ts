import { describe, it, expect, beforeEach } from "vitest";
import { listHelpArticles, getHelpArticle, clearHelpCache } from "@/lib/assistant/help";

describe("help loader", () => {
  beforeEach(() => clearHelpCache());

  it("parses at least one article (the placeholder)", () => {
    expect(listHelpArticles().length).toBeGreaterThan(0);
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

  it("placeholder article exposes 3 parsed steps", () => {
    const a = getHelpArticle("_placeholder");
    expect(a?.steps.length).toBe(3);
    expect(a?.steps[0]).toEqual({ n: 1, instruction: "Open the dashboard." });
  });
});
