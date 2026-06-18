import { describe, it, expect } from "vitest";
import { mapJobToIndeed } from "../../src/lib/indeed/job-mapper";

const baseJob = {
  id: "job-1",
  title: "Backend Engineer",
  description: "<p>Build APIs</p>",
  employment_type: "full_time" as const,
  location_type: "remote" as const,
  location: "Bangalore",
  salary_min: 1000000,
  salary_max: 2000000,
  show_salary: true,
  custom_questions: [{ question: "Years of Node?", required: true }],
};
const ctx = {
  companyName: "Acme",
  contactEmail: "hr@acme.com",
  applyUrl: "https://jambahr.com/careers/acme",
  postUrl: "https://jambahr.com/api/webhooks/indeed",
};

describe("mapJobToIndeed", () => {
  it("maps core fields and the postUrl", () => {
    const p = mapJobToIndeed(baseJob, ctx);
    expect(p.jobPostingId).toBe("job-1");
    expect(p.title).toBe("Backend Engineer");
    expect(p.company).toBe("Acme");
    expect(p.postUrl).toBe(ctx.postUrl);
    expect(p.location.remote).toBe(true);
    expect(p.screenerQuestions).toEqual([{ question: "Years of Node?", required: true }]);
  });

  it("includes salary only when show_salary is true", () => {
    expect(mapJobToIndeed(baseJob, ctx).salary).toEqual({ min: 1000000, max: 2000000 });
    expect(mapJobToIndeed({ ...baseJob, show_salary: false }, ctx).salary).toBeNull();
  });

  it("treats non-remote location types as not remote", () => {
    expect(mapJobToIndeed({ ...baseJob, location_type: "on_site" }, ctx).location.remote).toBe(false);
  });
});
