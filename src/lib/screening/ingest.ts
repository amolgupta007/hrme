// src/lib/screening/ingest.ts
import { createAdminSupabase } from "@/lib/supabase/server";
import { extractText } from "@/lib/assistant/extract";
import { embed } from "@/lib/assistant/embeddings";
import { parseCv } from "./parse";

// Resolve the storage object path from a public URL, or accept a raw path.
function pathFromResumeUrl(url: string): string | null {
  const marker = "/documents/";
  const i = url.indexOf(marker);
  if (i === -1) return url.startsWith("http") ? null : url;
  return url.slice(i + marker.length);
}

export async function ingestCv(candidateId: string): Promise<void> {
  const supabase = createAdminSupabase();

  const { data: cand } = await supabase
    .from("candidates")
    .select("id, org_id, resume_url")
    .eq("id", candidateId)
    .single();
  if (!cand) return;

  const orgId = (cand as any).org_id as string;
  const resumeUrl = (cand as any).resume_url as string | null;

  const baseRow = {
    org_id: orgId,
    candidate_id: candidateId,
    updated_at: new Date().toISOString(),
  };

  // cv_screening_profiles is not yet in database.types.ts — cast to any for upserts
  const profiles = (supabase as any).from("cv_screening_profiles");

  if (!resumeUrl) {
    await profiles.upsert({ ...baseRow, parse_status: "unsupported", source_document_path: null }, { onConflict: "candidate_id" });
    return;
  }

  const objectPath = pathFromResumeUrl(resumeUrl);
  if (!objectPath) {
    await profiles.upsert({ ...baseRow, parse_status: "unsupported", source_document_path: resumeUrl }, { onConflict: "candidate_id" });
    return;
  }

  const { data: file, error: dlErr } = await supabase.storage.from("documents").download(objectPath);
  if (dlErr || !file) {
    await profiles.upsert({ ...baseRow, parse_status: "needs_review", source_document_path: objectPath }, { onConflict: "candidate_id" });
    return;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = objectPath.split("/").pop() ?? "cv";
  const extracted = await extractText(buffer, file.type ?? "", name);

  if (!extracted.ok || !extracted.text.trim()) {
    await profiles.upsert(
      { ...baseRow, parse_status: "unsupported", source_document_path: objectPath, raw_text: null },
      { onConflict: "candidate_id" },
    );
    return;
  }

  try {
    const { parsed, confidence, model } = await parseCv(extracted.text);
    const [embedding] = await embed({ texts: [extracted.text.slice(0, 30_000)], inputType: "document" });
    await profiles.upsert(
      {
        ...baseRow,
        source_document_path: objectPath,
        raw_text: extracted.text,
        parsed,
        parse_confidence: confidence,
        parse_status: confidence >= 0.34 ? "ok" : "needs_review",
        embedding,
        model_version: model,
      },
      { onConflict: "candidate_id" },
    );
  } catch (e) {
    console.error(`[screening] ingestCv failed for ${candidateId}:`, e);
    await profiles.upsert(
      { ...baseRow, source_document_path: objectPath, raw_text: extracted.text, parse_status: "needs_review" },
      { onConflict: "candidate_id" },
    );
  }
}
