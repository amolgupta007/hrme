import { describe, it, expect } from "vitest";
import { ScreeningCriteriaSchema, ScoreResultSchema, ParsedCvSchema } from "@/lib/screening/types";

describe("screening schemas", () => {
  it("defaults top_k to 20 and accepts weighted requirements", () => {
    const c = ScreeningCriteriaSchema.parse({
      must_haves: [{ label: "React", weight: 5 }],
      nice_to_haves: [],
    });
    expect(c.top_k).toBe(20);
    expect(c.must_haves[0].weight).toBe(5);
  });

  it("rejects an out-of-range score", () => {
    expect(() =>
      ScoreResultSchema.parse({ score: 140, coverage: [], rationale: "x" }),
    ).toThrow();
  });

  it("parses a minimal CV", () => {
    const p = ParsedCvSchema.parse({
      contact: { name: "A", email: null, phone: null, location: null },
      skills: ["sql"],
      experience: [],
      education: [],
      certifications: [],
      total_experience_years: 3,
    });
    expect(p.skills).toEqual(["sql"]);
  });
});
