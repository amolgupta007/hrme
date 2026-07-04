// src/lib/documents/storage.ts
// PDF storage helpers over the existing private `documents` bucket. Draft PDFs
// are regeneratable (upsert); signed PDFs are written ONCE and never overwritten
// (immutable audit artifact). There was no shared signed-URL helper before —
// this is it. See docs/planning/documents-feature-plan.md §7.
import type { createAdminSupabase } from "@/lib/supabase/server";

type Sb = ReturnType<typeof createAdminSupabase>;

const BUCKET = "documents";

export function draftPdfPath(orgId: string, issuedDocId: string): string {
  return `${orgId}/doc-drafts/${issuedDocId}.pdf`;
}

export function signedPdfPath(orgId: string, signedRecordId: string): string {
  return `${orgId}/doc-signed/${signedRecordId}.pdf`;
}

/** Upload/replace the draft PDF. Returns the storage path. */
export async function uploadDraftPdf(
  sb: Sb,
  path: string,
  bytes: Buffer
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Upload the immutable signed PDF. upsert:false — never overwrite an audit artifact. */
export async function uploadSignedPdf(
  sb: Sb,
  path: string,
  bytes: Buffer
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

/** Time-limited signed URL for a stored PDF path (default 1 hour). */
export async function getSignedDocUrl(
  sb: Sb,
  path: string,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!path) return null;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  return data?.signedUrl ?? null;
}
