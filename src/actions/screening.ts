"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { assertJambaHireAccess } from "@/lib/jambahire-access";
import { ingestCv } from "@/lib/screening/ingest";
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
