"use server";

import { revalidatePath } from "next/cache";
import { waitUntil } from "@vercel/functions";
import { createAdminSupabase } from "@/lib/supabase/server";
import { assertJambaHireAccess } from "@/lib/jambahire-access";
import { ingestCv } from "@/lib/screening/ingest";
import { embed } from "@/lib/assistant/embeddings";
import { ScreeningCriteriaSchema } from "@/lib/screening/types";
import { suggestCriteria } from "@/lib/screening/criteria";
import { scoreCv } from "@/lib/screening/score";
import { assertScreeningBudget } from "@/lib/screening/budget";
import { screeningCostPaise } from "@/lib/screening/cost";
import { scoreToTier } from "@/lib/screening/tier";
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
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    // Browsers frequently report a PDF's MIME as "" or "application/octet-stream"
    // (esp. on Windows), so accept by extension as well as by reported MIME.
    const typeOk = ALLOWED.has(file.type) || ext === "pdf" || ext === "docx";
    if (!typeOk || file.size > 5 * 1024 * 1024) {
      console.error("[uploadCvs] skip: bad type/size", { name: file.name, type: file.type, size: file.size });
      skipped++;
      continue;
    }
    const contentType =
      file.type && file.type !== "application/octet-stream"
        ? file.type
        : ext === "pdf"
          ? "application/pdf"
          : ext === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/octet-stream";
    const path = `cv/${user.orgId}/${crypto.randomUUID()}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage.from("documents").upload(path, bytes, {
      contentType,
    });
    if (upErr) {
      console.error("[uploadCvs] skip: storage upload failed", { name: file.name, error: upErr.message });
      skipped++;
      continue;
    }
    const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);

    // One candidate per upload (no reliable email yet — parser fills contact later).
    // candidates is not in database.types.ts — cast to any (established repo pattern)
    // candidates.email is NOT NULL with a UNIQUE(org_id, email) constraint, but the
    // real email isn't known until the CV is parsed (background). Use a unique
    // placeholder so the insert succeeds; ingestCv stores the parsed contact in
    // cv_screening_profiles.parsed.
    const placeholderEmail = `cv-import+${crypto.randomUUID()}@placeholder.invalid`;
    const { data: cand, error: candErr } = await (supabase as any)
      .from("candidates")
      .insert({
        org_id: user.orgId,
        name: file.name.replace(/\.[^.]+$/, ""),
        email: placeholderEmail,
        source: "cv_upload",
        resume_url: urlData.publicUrl,
      })
      .select("id")
      .single();
    if (candErr || !cand) {
      console.error("[uploadCvs] skip: candidate insert failed", { error: (candErr as any)?.message });
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
      console.error("[uploadCvs] skip: application insert failed", { error: (appErr as any)?.message });
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

export async function getScreeningConfig(jobId: string): Promise<ActionResult<any>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();
  const { data } = await (supabase as any)
    .from("job_screening_criteria")
    .select("*")
    .eq("job_id", jobId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  return { success: true, data: data ?? null };
}

export async function upsertScreeningCriteria(
  jobId: string,
  criteria: unknown,
): Promise<ActionResult<void>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const parsed = ScreeningCriteriaSchema.safeParse(criteria);
  if (!parsed.success) return { success: false, error: "Invalid criteria" };
  const supabase = createAdminSupabase();
  const { error } = await (supabase as any).from("job_screening_criteria").upsert(
    {
      org_id: user.orgId,
      job_id: jobId,
      must_haves: parsed.data.must_haves,
      nice_to_haves: parsed.data.nice_to_haves,
      top_k: parsed.data.top_k,
      enabled: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "job_id" },
  );
  if (error) return { success: false, error: error.message };
  revalidatePath(`/hire/jobs/${jobId}/screening`);
  return { success: true, data: undefined };
}

export async function suggestCriteriaFromJd(
  jobId: string,
): Promise<ActionResult<{ must_haves: any[]; nice_to_haves: any[] }>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();
  const { data: job } = await supabase
    .from("jobs")
    .select("title, description")
    .eq("id", jobId)
    .eq("org_id", user.orgId)
    .single();
  if (!job) return { success: false, error: "Job not found" };
  try {
    const out = await suggestCriteria((job as any).title, (job as any).description ?? "");
    return { success: true, data: out };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Suggestion failed" };
  }
}

export async function runScreening(jobId: string): Promise<ActionResult<{ scored: number; skipped: number }>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();

  const { data: criteriaRow } = await (supabase as any)
    .from("job_screening_criteria")
    .select("must_haves, nice_to_haves, top_k")
    .eq("job_id", jobId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  const criteria = ScreeningCriteriaSchema.safeParse({
    must_haves: (criteriaRow as any)?.must_haves ?? [],
    nice_to_haves: (criteriaRow as any)?.nice_to_haves ?? [],
    top_k: (criteriaRow as any)?.top_k ?? 20,
  });
  if (!criteria.success || criteria.data.must_haves.length === 0)
    return { success: false, error: "Configure screening criteria first" };

  const stage1 = await runStage1Ranking(jobId);
  if (!stage1.success) return { success: false, error: stage1.error };

  let scored = 0;
  let skipped = 0;
  for (const cand of stage1.data.ranked) {
    const budget = await assertScreeningBudget(user.orgId, user.plan);
    if (!budget.ok) break; // stop scoring; keep what we have

    const { data: profile } = await (supabase as any)
      .from("cv_screening_profiles")
      .select("parsed, raw_text, parse_status")
      .eq("candidate_id", cand.candidate_id)
      .single();
    if (!profile || (profile as any).parse_status === "unsupported" || !(profile as any).raw_text) {
      skipped++;
      continue;
    }

    try {
      const { result, usage, model } = await scoreCv({
        criteria: criteria.data,
        parsed: (profile as any).parsed,
        cvText: (profile as any).raw_text,
      });
      const cost = screeningCostPaise({ model, ...usage });

      await (supabase as any).from("screening_results").upsert(
        {
          org_id: user.orgId,
          application_id: cand.application_id,
          candidate_id: cand.candidate_id,
          job_id: jobId,
          stage1_similarity: cand.similarity,
          score: result.score,
          tier: scoreToTier(result.score),
          coverage: result.coverage,
          rationale: result.rationale,
          model_version: model,
          criteria_snapshot: criteria.data,
          screened_at: new Date().toISOString(),
          screened_by: user.employeeId,
        },
        { onConflict: "application_id" },
      );

      await (supabase as any).from("screening_audit_log").insert({
        org_id: user.orgId,
        application_id: cand.application_id,
        action: "score",
        payload: { score: result.score, model, top_k: criteria.data.top_k, usage },
        cost_inr_paise: cost,
        actor_id: user.employeeId,
        actor_type: "admin",
      });
      scored++;
    } catch (e) {
      console.error(`[screening] score failed for application ${cand.application_id}:`, e);
      skipped++;
    }
  }

  revalidatePath(`/hire/jobs/${jobId}/screening`);
  return { success: true, data: { scored, skipped } };
}

export async function getScreeningResults(jobId: string): Promise<ActionResult<any[]>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();
  const { data, error } = await (supabase as any)
    .from("screening_results")
    .select("*, candidates(name, email, resume_url), applications(stage)")
    .eq("job_id", jobId)
    .eq("org_id", user.orgId)
    .order("score", { ascending: false, nullsFirst: false });
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}

/**
 * Roster of every uploaded CV for a job with its background parse status, so the
 * UI can show per-row "parsing / ready / needs review / unsupported" pills
 * instead of a blind gap after upload. (P1: async parse visibility.)
 */
export async function getScreeningRoster(
  jobId: string,
): Promise<ActionResult<Array<{ application_id: string; candidate_id: string; name: string; parse_status: string | null; scored: boolean }>>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();

  const { data: apps, error } = await (supabase as any)
    .from("applications")
    .select("id, candidate_id, candidates(name)")
    .eq("job_id", jobId)
    .eq("org_id", user.orgId)
    .order("applied_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  const candidateIds = (apps ?? []).map((a: any) => a.candidate_id);
  if (candidateIds.length === 0) return { success: true, data: [] };

  const [{ data: profiles }, { data: scored }] = await Promise.all([
    (supabase as any)
      .from("cv_screening_profiles")
      .select("candidate_id, parse_status")
      .eq("org_id", user.orgId)
      .in("candidate_id", candidateIds),
    (supabase as any)
      .from("screening_results")
      .select("application_id")
      .eq("org_id", user.orgId)
      .eq("job_id", jobId),
  ]);

  const statusBy = new Map((profiles ?? []).map((p: any) => [p.candidate_id, p.parse_status]));
  const scoredSet = new Set((scored ?? []).map((s: any) => s.application_id));

  const roster = (apps ?? []).map((a: any) => ({
    application_id: a.id,
    candidate_id: a.candidate_id,
    name: a.candidates?.name ?? "Candidate",
    parse_status: (statusBy.get(a.candidate_id) as string | undefined) ?? null,
    scored: scoredSet.has(a.id),
  }));
  return { success: true, data: roster };
}

export async function rescoreApplication(applicationId: string): Promise<ActionResult<void>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();
  const { data: app } = await (supabase as any)
    .from("applications")
    .select("job_id")
    .eq("id", applicationId)
    .eq("org_id", user.orgId)
    .single();
  if (!app) return { success: false, error: "Application not found" };
  // Simplest correct path: re-run the job's screening (idempotent upsert).
  const res = await runScreening((app as any).job_id);
  return res.success ? { success: true, data: undefined } : { success: false, error: res.error };
}

export async function reparseCv(candidateId: string): Promise<ActionResult<void>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  waitUntil(ingestCv(candidateId));
  return { success: true, data: undefined };
}

export async function getScreeningAudit(jobId: string): Promise<ActionResult<any[]>> {
  const gate = await assertJambaHireAccess();
  if ("error" in gate) return { success: false, error: gate.error };
  const { user } = gate;
  const supabase = createAdminSupabase();
  const { data: apps } = await (supabase as any)
    .from("applications")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("job_id", jobId);
  const appIds = (apps ?? []).map((a: any) => a.id);
  if (appIds.length === 0) return { success: true, data: [] };
  const { data, error } = await (supabase as any)
    .from("screening_audit_log")
    .select("*")
    .eq("org_id", user.orgId)
    .in("application_id", appIds)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return { success: false, error: error.message };
  return { success: true, data: data ?? [] };
}
