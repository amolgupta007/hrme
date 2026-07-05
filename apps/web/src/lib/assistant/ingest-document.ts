import { createAdminSupabase } from "@/lib/supabase/server";
import { extractText } from "./extract";
import { chunkMarkdown, embed } from "./embeddings";

const BUCKET = "documents";

type IndexStatus = "pending" | "indexed" | "unsupported" | "failed";

// Indexes a single document. Idempotent: wipes existing chunks for the doc first.
// Only company-wide docs are indexed (v1 scope). Never throws.
export async function ingestDocument(documentId: string): Promise<void> {
  const supabase = createAdminSupabase();

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, org_id, name, file_url, mime_type, is_company_wide")
    .eq("id", documentId)
    .single();
  if (docErr || !doc) return;

  const d = doc as {
    id: string; org_id: string; name: string | null;
    file_url: string; mime_type: string | null; is_company_wide: boolean;
  };

  // v1: only company-wide documents are searchable.
  if (!d.is_company_wide) {
    await markStatus(documentId, "unsupported", "personal document — not indexed in v1");
    return;
  }

  await markStatus(documentId, "pending");

  // Wipe any existing chunks (re-index path).
  await supabase.from("doc_chunks").delete().eq("document_id", documentId);

  // Download the file from Storage.
  const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(d.file_url);
  if (dlErr || !file) {
    await markStatus(documentId, "failed", dlErr?.message ?? "download failed");
    return;
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  const extracted = await extractText(buffer, d.mime_type ?? "", d.name ?? "");
  if (!extracted.ok) {
    await markStatus(
      documentId,
      extracted.reason === "unsupported" ? "unsupported" : extracted.reason === "empty" ? "unsupported" : "failed",
      extracted.reason,
    );
    return;
  }

  const chunks = chunkMarkdown(extracted.text);
  if (chunks.length === 0) {
    await markStatus(documentId, "unsupported", "no extractable text");
    return;
  }

  // Enrich embedded text with the document name for better recall.
  const enriched = chunks.map((c) => `Document: ${d.name ?? "Untitled"}\n\n${c}`);
  let embeddings: number[][];
  try {
    embeddings = await embed({ texts: enriched, inputType: "document" });
  } catch (err) {
    await markStatus(documentId, "failed", err instanceof Error ? err.message : "embed failed");
    return;
  }

  const rows = chunks.map((content, i) => ({
    org_id: d.org_id,
    document_id: documentId,
    content,
    page_or_section: null,
    token_count: Math.ceil(content.length / 4),
    embedding: embeddings[i],
  }));

  const { error: insErr } = await supabase.from("doc_chunks").insert(rows);
  if (insErr) {
    await markStatus(documentId, "failed", insErr.message);
    return;
  }
  await markStatus(documentId, "indexed");
}

async function markStatus(documentId: string, status: IndexStatus, error?: string): Promise<void> {
  const supabase = createAdminSupabase();
  await supabase
    .from("documents")
    .update({
      index_status: status,
      index_error: error ?? null,
      indexed_at: status === "indexed" ? new Date().toISOString() : null,
    })
    .eq("id", documentId);
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  const supabase = createAdminSupabase();
  await supabase.from("doc_chunks").delete().eq("document_id", documentId);
}
