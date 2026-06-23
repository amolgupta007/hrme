import { describe, it, expect } from "vitest";
import { computeContractorTDS } from "@/lib/contractor/tds";

describe("computeContractorTDS — 194J professional fees", () => {
  it("deducts 10% above the 30k threshold", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194J", payeeType: "individual_huf", hasPan: true });
    expect(r.ratePct).toBe(10);
    expect(r.tds).toBe(5000);
    expect(r.thresholdApplied).toBe(false);
  });

  it("deducts nothing at or below the 30k threshold", () => {
    const r = computeContractorTDS({ amount: 30000, section: "194J", payeeType: "individual_huf", hasPan: true });
    expect(r.tds).toBe(0);
    expect(r.thresholdApplied).toBe(true);
  });
});

describe("computeContractorTDS — 194C contract work", () => {
  it("uses 1% for individual/HUF", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194C", payeeType: "individual_huf", hasPan: true });
    expect(r.ratePct).toBe(1);
    expect(r.tds).toBe(500);
  });

  it("uses 2% for non-individual payees", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194C", payeeType: "other", hasPan: true });
    expect(r.ratePct).toBe(2);
    expect(r.tds).toBe(1000);
  });

  it("triggers via YTD aggregate even when the single payment is under 30k", () => {
    const r = computeContractorTDS({ amount: 20000, section: "194C", payeeType: "individual_huf", hasPan: true, ytdPaid: 90000 });
    expect(r.thresholdApplied).toBe(false);
    expect(r.tds).toBe(200);
  });

  it("does not trigger when single < 30k and aggregate < 1L", () => {
    const r = computeContractorTDS({ amount: 20000, section: "194C", payeeType: "individual_huf", hasPan: true, ytdPaid: 10000 });
    expect(r.tds).toBe(0);
    expect(r.thresholdApplied).toBe(true);
  });
});

describe("computeContractorTDS — no PAN (§206AA)", () => {
  it("bumps the rate to 20% regardless of section", () => {
    const r = computeContractorTDS({ amount: 50000, section: "194C", payeeType: "individual_huf", hasPan: false });
    expect(r.ratePct).toBe(20);
    expect(r.tds).toBe(10000);
  });
});
