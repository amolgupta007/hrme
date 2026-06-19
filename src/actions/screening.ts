"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { assertJambaHireAccess } from "@/lib/jambahire-access";
import { ingestCv } from "@/lib/screening/ingest";
import { embed } from "@/lib/assistant/embeddings";
import type { ActionResult } from "@/types";

const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function uploadCvs(
  formData: FormData,
): Promise<ActionResult<{ created: number; skipped: number }>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;

  const jobId = formData.get("jobId");
  if (typeof jobId !== "string" || !jobId) return { success: false, error: "Missing jobId" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { success: false, error: "No files provided" };

  const supabase = createAdminSupabase();
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    if (!ALLOWED.has(file.type) || file.size > 5 * 1024 * 1024) {
      skipped++;
      continue;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `cv/${user.orgId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage.from("documents").upload(path, bytes, {
      contentType: file.type,
    });
    if (upErr) {
      skipped++;
      continue;
    }
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);

    // One candidate per upload (no reliable email yet — parser fills contact later).
    // candidates is not in database.types.ts — cast to any (established repo pattern)
    const { data: cand, error: candErr } = await (supabase as any)
      .from("candidates")
      .insert({
        org_id: user.orgId,
        name: file.name.replace(/\.[^.]+$/, ""),
        source: "cv_upload",
        resume_url: urlData.publicUrl,
      })
      .select("id")
      .single();
    if (candErr || !cand) {
      skipped++;
      continue;
    }
    const candidateId = (cand as any).id as string;

    const { error: appErr } = await (supabase as any).from("applications").insert({
      org_id: user.orgId,
      job_id: jobId,
      candidate_id: candidateId,
      stage: "applied",
    });
    if (appErr) {
      skipped++;
      continue;
    }

    waitUntil(ingestCv(candidateId));
    created++;
  }

  revalidatePath(`/hire/jobs/${jobId}/screening`);
  return { success: true, data: { created, skipped } };
}

export async function runStage1Ranking(
  jobId: string,
): Promise<
  ActionResult<{
    ranked: Array<{
      profile_id: string;
      candidate_id: string;
      application_id: string;
      similarity: number;
    }>;
  }>
> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description")
    .eq("id", jobId)
    .eq("org_id", user.orgId)
    .single();
  if (!job) return { success: false, error: "Job not found" };

  const { data: criteria } = await (supabase as any)
    .from("job_screening_criteria")
    .select("must_haves, nice_to_haves, top_k")
    .eq("job_id", jobId)
    .maybeSingle();

  const labels = [
    ...(((criteria as any)?.must_haves ?? []) as Array<{ label: string }>),
    ...(((criteria as any)?.nice_to_haves ?? []) as Array<{ label: string }>),
  ]
    .map((r) => r.label)
    .join(", ");
  const topK = ((criteria as any)?.top_k as number) ?? 20;

  const queryText = `${(job as any).title}\n${(job as any).description ?? ""}\nKey requirements: ${labels}`;
  const [queryEmbedding] = await embed({ texts: [queryText], inputType: "query" });

  const { data: ranked, error } = await supabase.rpc("match_cv_profiles", {
    query_embedding: queryEmbedding,
    p_org_id: user.orgId,
    p_job_id: jobId,
    match_count: topK,
  } as any);
  if (error) return { success: false, error: error.message };

  return { success: true, data: { ranked: (ranked ?? []) as any } };
}
