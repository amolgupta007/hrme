import { z } from "zod";

/** Outbound: payload we send to the Job Sync API (create/upsert). */
export type IndeedJobPayload = {
  jobPostingId: string; // our jobs.id — unique per ATS
  title: string;
  description: string; // HTML
  employmentType: string; // mapped from our employment_type
  company: string; // org name
  location: { city: string | null; remote: boolean };
  salary: { min: number; max: number } | null; // null unless show_salary
  contact: { email: string };
  applyUrl: string; // careers page URL (human apply)
  postUrl: string; // our webhook — where Indeed POSTs applications
  screenerQuestions: { question: string; required: boolean }[];
};

export type IndeedScreenerQA = { question: string; answer: string };

/** Inbound: Indeed Apply POSTs this JSON to our webhook. */
export const IndeedApplicationSchema = z
  .object({
    id: z.string(), // Indeed's application id — our dedup key
    appliedOnMillis: z.number().optional(),
    job: z
      .object({
        jobId: z.string().optional(), // echoes our jobPostingId
        jobTitle: z.string().optional(),
        jobCompany: z.string().optional(),
        jobLocation: z.string().optional(),
        jobUrl: z.string().optional(),
      })
      .passthrough()
      .optional(),
    applicant: z
      .object({
        fullName: z.string().optional().default(""),
        email: z.string().optional().default(""),
        phoneNumber: z.string().optional().default(""),
        coverletter: z.string().optional().default(""),
        resume: z
          .object({
            file: z
              .object({
                contentType: z.string().optional(),
                data: z.string().optional(), // base64
                fileName: z.string().optional(),
              })
              .passthrough()
              .optional(),
            text: z.string().optional(),
          })
          .passthrough()
          .optional(),
        questions: z
          .array(
            z
              .object({ question: z.string().default(""), answer: z.string().default("") })
              .passthrough()
          )
          .optional()
          .default([]),
      })
      .passthrough(),
  })
  .passthrough();

export type IndeedApplication = z.infer<typeof IndeedApplicationSchema>;
