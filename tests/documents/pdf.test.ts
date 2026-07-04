import { describe, it, expect } from "vitest";
import { renderDocumentPdf } from "@/lib/documents/pdf";

describe("renderDocumentPdf", () => {
  it("renders a valid PDF buffer for a draft", async () => {
    const buf = await renderDocumentPdf({
      documentTitle: "Letter of Appointment",
      issuingEntityName: "Acme Technologies Pvt Ltd",
      issuingEntityAddress: "Pune 411001",
      clauses: [
        { title: "Position", body_markdown: "You are appointed as **Engineer**.", category: "custom" },
        { title: "Duties", body_markdown: "- Write code\n- Review PRs", category: "behavior" },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    // PDF magic number
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(1000);
  }, 30000);

  it("embeds the acknowledgement block for a signed PDF", async () => {
    const buf = await renderDocumentPdf({
      documentTitle: "Letter of Appointment",
      issuingEntityName: "Acme",
      clauses: [{ title: "Terms", body_markdown: "Standard terms apply.", category: "custom" }],
      acknowledgement: {
        signerName: "Priya Sharma",
        acknowledgedAt: "Jul 4, 2026",
        ip: "203.0.113.1",
        statement: "Electronic acknowledgement, not a certified signature.",
      },
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30000);
});
