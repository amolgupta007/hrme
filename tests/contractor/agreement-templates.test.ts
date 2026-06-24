import { describe, it, expect } from "vitest";
import { defaultAgreementTitle, buildAgreementBody, isAgreementExpired } from "@/lib/contractor/agreement-templates";

describe("defaultAgreementTitle", () => {
  it("names each type", () => {
    expect(defaultAgreementTitle("nda")).toMatch(/Non-Disclosure/i);
    expect(defaultAgreementTitle("ip_assignment")).toMatch(/IP Assignment/i);
    expect(defaultAgreementTitle("service")).toMatch(/Service Agreement/i);
  });
});

describe("buildAgreementBody", () => {
  const base = { orgName: "Acme Studios", contractorName: "Riya Sen" } as const;

  it("includes both parties", () => {
    const body = buildAgreementBody({ type: "service", ipOwnership: "work_for_hire", ...base });
    expect(body).toContain("Acme Studios");
    expect(body).toContain("Riya Sen");
  });

  it("work_for_hire body assigns ownership to the org", () => {
    const body = buildAgreementBody({ type: "ip_assignment", ipOwnership: "work_for_hire", ...base });
    expect(body).toMatch(/work made for hire/i);
    expect(body).toContain("Acme Studios");
  });

  it("licensed body keeps ownership with the contractor", () => {
    const body = buildAgreementBody({ type: "ip_assignment", ipOwnership: "licensed", ...base });
    expect(body).toMatch(/retains? ownership/i);
    expect(body).toMatch(/licen[cs]e/i);
  });

  it("nda body talks about confidential information", () => {
    const body = buildAgreementBody({ type: "nda", ipOwnership: "na", ...base });
    expect(body).toMatch(/confidential/i);
  });
});

describe("isAgreementExpired", () => {
  it("null expiry never expires", () => {
    expect(isAgreementExpired(null, 1_000)).toBe(false);
  });
  it("past expiry is expired", () => {
    expect(isAgreementExpired(new Date(1_000).toISOString(), 2_000)).toBe(true);
  });
  it("future expiry is not expired", () => {
    expect(isAgreementExpired(new Date(5_000).toISOString(), 2_000)).toBe(false);
  });
});
