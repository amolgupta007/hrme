import { describe, it, expect } from "vitest";
import { mapIndeedApplication } from "../../src/lib/indeed/application-mapper";
import { IndeedApplicationSchema } from "../../src/lib/indeed/types";

const ids = { orgId: "org-1", jobId: "job-1" };

function parse(raw: unknown) {
  return IndeedApplicationSchema.parse(raw);
}

describe("mapIndeedApplication", () => {
  it("maps contact, source, answers and cover note", () => {
    const payload = parse({
      id: "ind-app-1",
      job: { jobId: "indeed-xyz" },
      applicant: {
        fullName: "Asha Rao",
        email: "ASHA@EXAMPLE.com",
        phoneNumber: "+919812345678",
        coverletter: "Keen to join",
        questions: [{ question: "Years of Node?", answer: "5" }],
      },
    });
    const out = mapIndeedApplication(payload, ids);
    expect(out.candidate).toEqual({
      org_id: "org-1",
      name: "Asha Rao",
      email: "asha@example.com",
      phone: "+919812345678",
      source: "indeed",
    });
    expect(out.application.job_id).toBe("job-1");
    expect(out.application.cover_note).toBe("Keen to join");
    expect(out.application.answers).toEqual([{ question: "Years of Node?", answer: "5" }]);
    expect(out.resume).toBeNull();
  });

  it("decodes a base64 résumé file", () => {
    const data = Buffer.from("PDF-BYTES").toString("base64");
    const payload = parse({
      id: "ind-app-2",
      applicant: {
        email: "x@y.com",
        resume: { file: { contentType: "application/pdf", data, fileName: "cv.pdf" } },
      },
    });
    const out = mapIndeedApplication(payload, ids);
    expect(out.resume?.fileName).toBe("cv.pdf");
    expect(out.resume?.contentType).toBe("application/pdf");
    expect(out.resume?.buffer.toString()).toBe("PDF-BYTES");
  });

  it("handles missing optional fields without throwing", () => {
    const payload = parse({ id: "ind-app-3", applicant: { email: "z@z.com" } });
    const out = mapIndeedApplication(payload, ids);
    expect(out.candidate.name).toBe("");
    expect(out.application.cover_note).toBeNull();
    expect(out.application.answers).toEqual([]);
    expect(out.resume).toBeNull();
  });
});
