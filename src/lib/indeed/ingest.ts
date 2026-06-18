import { createAdminSupabase } from "@/lib/supabase/server";
import { mapIndeedApplication } from "./application-mapper";
import type { IndeedApplication } from "./types";

export async function ingestIndeedApplication(
  payload: IndeedApplication
): Promise<"created" | "duplicate" | "unknown_job"> {
  const supabase = createAdminSupabase();

  const indeedJobId = payload.job?.jobId;
  if (!indeedJobId) return "unknown_job";

  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id")
    .eq("indeed_job_id", indeedJobId)
    .single();
  if (!job) return "unknown_job";

  const mapped = mapIndeedApplication(payload, {
    orgId: (job as any).org_id,
    jobId: (job as any).id,
  });
  if (!mapped.candidate.email) return "unknown_job"; // cannot dedupe without email

  // résumé → documents bucket (best-effort)
  let resumeUrl: string | null = null;
  if (mapped.resume) {
    const ext = mapped.resume.fileName.split(".").pop()?.toLowerCase() || "pdf";
    const path = `indeed/${(job as any).org_id}/${payload.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("documents")
      .upload(path, mapped.resume.buffer, {
        contentType: mapped.resume.contentType,
        upsert: true,
      });
    if (!upErr) {
      resumeUrl = supabase.storage.from("documents").getPublicUrl(path).data.publicUrl;
    }
  }

  const candidatePayload: Record<string, unknown> = { ...mapped.candidate };
  if (resumeUrl) candidatePayload.resume_url = resumeUrl;

  const { data: candidate, error: candErr } = await supabase
    .from("candidates")
    .upsert(candidatePayload, { onConflict: "org_id,email" })
    .select("id")
    .single();
  if (candErr || !candidate) throw new Error(candErr?.message || "candidate upsert failed");

  const { error: appErr } = await supabase.from("applications").insert({
    org_id: mapped.application.org_id,
    job_id: mapped.application.job_id,
    candidate_id: (candidate as any).id,
    stage: "applied",
    cover_note: mapped.application.cover_note,
    answers: mapped.application.answers,
  });
  if (appErr) {
    if ((appErr as any).code === "23505") return "duplicate";
    throw new Error(appErr.message);
  }
  return "created";
}
