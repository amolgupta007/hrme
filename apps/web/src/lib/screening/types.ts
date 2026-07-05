import { z } from "zod";

export const ParsedCvSchema = z.object({
  contact: z.object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
  }),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      title: z.string(),
      employer: z.string().nullable(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      summary: z.string().nullable(),
    }),
  ),
  education: z.array(
    z.object({
      degree: z.string().nullable(),
      institution: z.string().nullable(),
      year: z.string().nullable(),
    }),
  ),
  certifications: z.array(z.string()),
  total_experience_years: z.number().nullable(),
});
export type ParsedCv = z.infer<typeof ParsedCvSchema>;

export const RequirementSchema = z.object({
  label: z.string().min(1),
  weight: z.number().int().min(1).max(5),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const ScreeningCriteriaSchema = z.object({
  must_haves: z.array(RequirementSchema),
  nice_to_haves: z.array(RequirementSchema),
  top_k: z.number().int().min(1).max(100).default(20),
});
export type ScreeningCriteria = z.infer<typeof ScreeningCriteriaSchema>;

export type Tier = "strong" | "possible" | "weak";

export const CoverageItemSchema = z.object({
  label: z.string(),
  status: z.enum(["green", "amber", "red"]),
  note: z.string().nullable(),
});
export type CoverageItem = z.infer<typeof CoverageItemSchema>;

export const ScoreResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  coverage: z.array(CoverageItemSchema),
  rationale: z.string(),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
