import type { IndeedClient } from "./client";
import type { IndeedJobPayload } from "./types";

// Deterministic, no-network stand-in used whenever INDEED_LIVE !== "true".
export const sandboxIndeedClient: IndeedClient = {
  async upsertJob(p: IndeedJobPayload) {
    console.log("[indeed:sandbox] upsertJob", p.jobPostingId, p.title);
    return { indeedJobId: `sandbox-${p.jobPostingId}` };
  },
  async expireJob(jobPostingId: string) {
    console.log("[indeed:sandbox] expireJob", jobPostingId);
  },
};
