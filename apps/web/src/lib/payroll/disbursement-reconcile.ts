import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Reconciles a batch + its parent payroll_run status based on the aggregate
 * statuses of its disbursement_items. Idempotent.
 *
 * Rules:
 *   - All items 'paid'                          → batch 'completed', run 'paid'
 *   - No pending/queued/processing + any failed → batch 'partial_failed', run 'disbursement_failed'
 *   - Anything else (still some in flight)      → batch 'processing', run 'disbursing'
 *
 * Used by:
 *   - RazorpayX webhook (`/api/webhooks/razorpayx`) after each payout event
 *   - `approveDisbursement` server action after the initial bulk/per-item push
 *   - `retryFailedPayouts` server action after admin-initiated retries
 *
 * Note: takes a SupabaseClient so callers can reuse their already-created
 * admin client (avoids double-allocation) and so this module stays free of
 * `"use server"` (it's a plain helper, importable from API routes + actions).
 */
export async function reconcileBatchAndRunStatus(
  sb: SupabaseClient,
  batchId: string,
  orgId: string
): Promise<void> {
  // Step 1: update the current batch's status from its own items
  const { data: items } = await sb
    .from("disbursement_items")
    .select("status")
    .eq("batch_id", batchId)
    .eq("org_id", orgId);

  const statuses = (items ?? []).map((i: any) => i.status as string);
  const allPaid = statuses.length > 0 && statuses.every((s) => s === "paid");
  const anyFailed = statuses.some((s) => s === "failed");
  const anyPending = statuses.some((s) => ["pending", "queued", "processing"].includes(s));

  let batchStatus: string;
  if (allPaid) batchStatus = "completed";
  else if (!anyPending && anyFailed) batchStatus = "partial_failed";
  else batchStatus = "processing";

  const batchUpdates: Record<string, any> = { status: batchStatus };
  if (batchStatus === "completed") batchUpdates.completed_at = new Date().toISOString();
  await sb
    .from("disbursement_batches")
    .update(batchUpdates as any)
    .eq("id", batchId)
    .eq("org_id", orgId);

  // Step 2: get the parent run ID and compute the run-level status by aggregating ALL batches for this run
  const { data: batchRow } = await sb
    .from("disbursement_batches")
    .select("payroll_run_id")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!batchRow) return;
  const runId = (batchRow as any).payroll_run_id;
  // Contractor batches have no parent payroll run — skip run-status update entirely.
  if (!runId) return;

  // Fetch all batches for the run + their items
  const { data: runBatches } = await sb
    .from("disbursement_batches")
    .select("id, status")
    .eq("payroll_run_id", runId)
    .eq("org_id", orgId);
  const runBatchIds = (runBatches ?? []).map((b: any) => b.id);
  if (runBatchIds.length === 0) return;

  const { data: allRunItems } = await sb
    .from("disbursement_items")
    .select("status")
    .in("batch_id", runBatchIds)
    .eq("org_id", orgId);

  const allStatuses = (allRunItems ?? []).map((i: any) => i.status as string);
  const runAllPaid = allStatuses.length > 0 && allStatuses.every((s) => s === "paid");
  const runAnyFailed = allStatuses.some((s) => s === "failed");
  const runAnyPending = allStatuses.some((s) => ["pending", "queued", "processing"].includes(s));

  let runStatus: string;
  if (runAllPaid) runStatus = "paid";
  else if (!runAnyPending && runAnyFailed) runStatus = "disbursement_failed";
  else runStatus = "disbursing";

  const runUpdates: Record<string, any> = { status: runStatus };
  if (runStatus === "paid") runUpdates.paid_at = new Date().toISOString();
  await sb
    .from("payroll_runs")
    .update(runUpdates as any)
    .eq("id", runId)
    .eq("org_id", orgId);
}
