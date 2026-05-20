import mammoth from "mammoth";

export type ExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported" | "empty" | "error"; detail?: string };

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): Promise<ExtractResult> {
  try {
    const mime = (mimeType || "").toLowerCase();
    const ext = (filename?.split(".").pop() ?? "").toLowerCase();

    // Plain text / markdown
    if (mime.startsWith("text/") || ext === "txt" || ext === "md") {
      const text = buffer.toString("utf8").trim();
      return text ? { ok: true, text } : { ok: false, reason: "empty" };
    }

    // DOCX
    if (mime === DOCX_MIME || ext === "docx") {
      const { value } = await mammoth.extractRawText({ buffer });
      const text = (value ?? "").trim();
      return text ? { ok: true, text } : { ok: false, reason: "empty" };
    }

    // PDF (text-based only; scanned PDFs yield little/no text -> 'empty')
    // unpdf API: extractText(pdf, { mergePages: true }) -> { totalPages, text: string }
    if (mime === "application/pdf" || ext === "pdf") {
      const { extractText: extractPdf, getDocumentProxy } = await import("unpdf");
      const uint8 = new Uint8Array(buffer);
      const pdf = await getDocumentProxy(uint8);
      const result = await extractPdf(pdf, { mergePages: true });
      const merged = result.text.trim();
      return merged ? { ok: true, text: merged } : { ok: false, reason: "empty" };
    }

    return { ok: false, reason: "unsupported", detail: mime || ext };
  } catch (err) {
    return {
      ok: false,
      reason: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
