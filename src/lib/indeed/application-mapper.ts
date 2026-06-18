import type { IndeedApplication } from "./types";

export type MappedApplication = {
  candidate: {
    org_id: string;
    name: string;
    email: string;
    phone: string;
    source: "indeed";
  };
  resume: { buffer: Buffer; fileName: string; contentType: string } | null;
  application: {
    org_id: string;
    job_id: string;
    cover_note: string | null;
    answers: { question: string; answer: string }[];
  };
};

export function mapIndeedApplication(
  payload: IndeedApplication,
  ids: { orgId: string; jobId: string }
): MappedApplication {
  const a = payload.applicant;

  let resume: MappedApplication["resume"] = null;
  const file = a.resume?.file;
  if (file?.data) {
    resume = {
      buffer: Buffer.from(file.data, "base64"),
      fileName: file.fileName || `indeed-resume-${payload.id}`,
      contentType: file.contentType || "application/octet-stream",
    };
  }

  return {
    candidate: {
      org_id: ids.orgId,
      name: a.fullName ?? "",
      email: (a.email ?? "").trim().toLowerCase(),
      phone: a.phoneNumber ?? "",
      source: "indeed",
    },
    resume,
    application: {
      org_id: ids.orgId,
      job_id: ids.jobId,
      cover_note: a.coverletter ? a.coverletter : null,
      answers: (a.questions ?? []).map((q) => ({ question: q.question, answer: q.answer })),
    },
  };
}
