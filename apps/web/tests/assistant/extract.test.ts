import { describe, it, expect } from "vitest";
import { extractText } from "@/lib/assistant/extract";

describe("extractText", () => {
  it("extracts plain text", async () => {
    const r = await extractText(Buffer.from("Hello policy world"), "text/plain", "a.txt");
    expect(r).toEqual({ ok: true, text: "Hello policy world" });
  });

  it("treats .md by extension as text", async () => {
    const r = await extractText(Buffer.from("# Heading\n\nbody"), "application/octet-stream", "x.md");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain("Heading");
  });

  it("returns empty for blank text", async () => {
    const r = await extractText(Buffer.from("   "), "text/plain", "a.txt");
    expect(r).toEqual({ ok: false, reason: "empty" });
  });

  it("returns unsupported for an unknown binary type", async () => {
    const r = await extractText(Buffer.from([0, 1, 2, 3]), "image/png", "scan.png");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unsupported");
  });
});
