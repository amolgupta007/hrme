import type { IndeedJobPayload } from "./types";

type JobInput = {
  id: string;
  title: string;
  description: string;
  employment_type: "full_time" | "part_time" | "contract" | "intern";
  location_type: "on_site" | "remote" | "hybrid";
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  show_salary: boolean;
  custom_questions: { question: string; required: boolean }[];
};

type MapCtx = { companyName: string; contactEmail: string; applyUrl: string; postUrl: string };

const EMPLOYMENT_MAP: Record<JobInput["employment_type"], string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACT",
  intern: "INTERNSHIP",
};

export function mapJobToIndeed(job: JobInput, ctx: MapCtx): IndeedJobPayload {
  const hasSalary =
    job.show_salary && job.salary_min != null && job.salary_max != null;
  return {
    jobPostingId: job.id,
    title: job.title,
    description: job.description,
    employmentType: EMPLOYMENT_MAP[job.employment_type],
    company: ctx.companyName,
    location: { city: job.location ?? null, remote: job.location_type === "remote" },
    salary: hasSalary ? { min: job.salary_min!, max: job.salary_max! } : null,
    contact: { email: ctx.contactEmail },
    applyUrl: ctx.applyUrl,
    postUrl: ctx.postUrl,
    screenerQuestions: job.custom_questions ?? [],
  };
}
