import type { IndeedJobPayload } from "./types";
import { getIndeedAccessToken } from "./oauth";

export interface IndeedClient {
  upsertJob(p: IndeedJobPayload): Promise<{ indeedJobId: string }>;
  expireJob(jobPostingId: string): Promise<void>;
}

const GRAPHQL_URL = "https://apis.indeed.com/graphql";

async function call(query: string, variables: Record<string, unknown>) {
  const token = await getIndeedAccessToken();
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: any; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length) {
    throw new Error(`Indeed Job Sync error: ${res.status} ${JSON.stringify(json.errors ?? "")}`);
  }
  return json.data;
}

// NOTE: GraphQL operation names/shape follow the Job Sync API guide; confirm against
// docs.indeed.com/job-sync-api at go-live. Localized to this file if it shifts.
export const realIndeedClient: IndeedClient = {
  async upsertJob(p) {
    const data = await call(
      `mutation Upsert($input: CreateSourcedJobsInput!) {
         jobs { sourceJobs(input: $input) { jobs { sourcedPostingId } } }
       }`,
      { input: { jobs: [indeedJobInput(p)] } }
    );
    const id =
      data?.jobs?.sourceJobs?.jobs?.[0]?.sourcedPostingId ?? p.jobPostingId;
    return { indeedJobId: String(id) };
  },
  async expireJob(jobPostingId) {
    await call(
      `mutation Expire($input: ExpireSourcedJobsInput!) {
         jobs { expireSourcedJobs(input: $input) { jobs { sourcedPostingId } } }
       }`,
      { input: { sourcedPostingIds: [jobPostingId] } }
    );
  },
};

function indeedJobInput(p: IndeedJobPayload) {
  return {
    sourcedPostingId: p.jobPostingId,
    title: p.title,
    description: p.description,
    employmentType: p.employmentType,
    companyName: p.company,
    location: { city: p.location.city, remote: p.location.remote },
    compensation: p.salary
      ? { min: p.salary.min, max: p.salary.max, currency: "INR" }
      : undefined,
    recruiterEmail: p.contact.email,
    applyUrl: p.applyUrl,
    indeedApply: { postUrl: p.postUrl, screenerQuestions: p.screenerQuestions },
  };
}
