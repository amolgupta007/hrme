"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import { getCachedVerification, type PennyDropStatus } from "@/actions/penny-drop";
import {
  createRazorpayXClient,
  createBulkPayout,
  createPayout,
  type PayoutResponse,
} from "@/lib/razorpayx";
import { reconcileBatchAndRunStatus } from "@/lib/payroll/disbursement-reconcile";

// ---- Types ----

export type PreflightItem = {
  employee_id: string;
  employee_name: string;
  amount: number; // rupees, from payroll_entries.net_pay
  bank_account_last4: string | null;
  bank_account_ifsc_first4: string | null;
  fund_account_id: string | null;
  beneficiary_sync_status: "pending" | "synced" | "failed";
  verification_status: PennyDropStatus | "not_checked";
  verification_error: string | null;
  blocking: boolean; // true = cannot include in payout
};

export type PreflightResult = {
  run_id: string;
  total_payable: number; // rupees
  wallet_balance: number | null; // null = unknown (RazorpayX getBalance not yet wired); rupees
  shortfall: number | null; // total_payable - wallet_balance, null if wallet unknown
  items: PreflightItem[];
  blocking_count: number;
  ready_to_initiate: boolean;
};

// ---- Helpers ----

/**
 * Returns wallet balance in rupees, or null if we can't determine it.
 * Phase 2 v1: returns null (will surface as "Balance: unknown" in UI).
 * Phase 2.5: wire to actual RazorpayX balance endpoint.
 */
async function getWalletBalance(/* client: RazorpayXClient */): Promise<number | null> {
  // TODO(integration): RazorpayX exposes balance via /banking_account_statement/balance
  // or similar — confirm endpoint shape against current docs at integration test time.
  return null;
}

async function logAudit(
  orgId: string,
  batchId: string | null,
  actorId: string | null,
  actorRole: string | null,
  action: string,
  payload: any
) {
  const sb = createAdminSupabase();
  await sb.from("disbursement_audit_log").insert({
    org_id: orgId,
    batch_id: batchId,
    actor_id: actorId,
    actor_role: actorRole,
    action,
    payload,
  } as any);
}

// ---- runPreflight ----

export async function runPreflight(runId: string): Promise<ActionResult<PreflightResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can run preflight" };

  const sb = createAdminSupabase();

  // 1. Load run + verify ownership + status
  const { data: run } = await sb
    .from("payroll_runs")
    .select("id, org_id, status")
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!run) return { success: false, error: "Payroll run not found" };
  const runRow = run as any;
  if (runRow.status !== "processed" && runRow.status !== "disbursement_failed") {
    return { success: false, error: `Cannot run preflight on a ${runRow.status} run` };
  }

  // 2. Verify RazorpayX is connected
  const { data: creds } = await sb
    .from("razorpayx_credentials")
    .select("id")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!creds) return { success: false, error: "RazorpayX not connected" };

  // 3. Load all entries for this run
  const { data: entries } = await sb
    .from("payroll_entries")
    .select("employee_id, net_pay, employees!employee_id(first_name, last_name)")
    .eq("payroll_run_id", runId)
    .eq("org_id", user.orgId);

  if (!entries || entries.length === 0) {
    return { success: false, error: "Payroll run has no entries" };
  }

  // 4. Load bank accounts for these employees in one query
  const employeeIds = (entries as any[]).map((e) => e.employee_id);
  const { data: banks } = await sb
    .from("employee_bank_accounts")
    .select("employee_id, account_number_last4, ifsc_first4, razorpayx_fund_account_id, beneficiary_sync_status")
    .eq("org_id", user.orgId)
    .in("employee_id", employeeIds);
  const bankByEmp = new Map((banks ?? []).map((b: any) => [b.employee_id, b]));

  // 5. Build preflight items
  const items: PreflightItem[] = [];
  let totalPayable = 0;
  for (const e of entries as any[]) {
    const bank = bankByEmp.get(e.employee_id) as any | undefined;
    const employeeName = e.employees ? `${e.employees.first_name} ${e.employees.last_name}` : "Unknown";
    totalPayable += e.net_pay;

    let verification_status: PennyDropStatus | "not_checked" = "not_checked";
    let verification_error: string | null = null;
    if (bank?.razorpayx_fund_account_id) {
      const cached = await getCachedVerification(e.employee_id);
      if (cached.success && cached.data) {
        verification_status = cached.data.status;
        verification_error = cached.data.error_message;
      }
    }

    // Blocking criteria:
    // - No bank account at all
    // - No synced fund_account_id
    // - Verification failed (invalid_account / name_mismatch / error)
    const noBank = !bank;
    const notSynced = !bank?.razorpayx_fund_account_id;
    const failedVerify = verification_status === "invalid_account" || verification_status === "error";
    const blocking = noBank || notSynced || failedVerify;

    items.push({
      employee_id: e.employee_id,
      employee_name: employeeName,
      amount: e.net_pay,
      bank_account_last4: bank?.account_number_last4 ?? null,
      bank_account_ifsc_first4: bank?.ifsc_first4 ?? null,
      fund_account_id: bank?.razorpayx_fund_account_id ?? null,
      beneficiary_sync_status: bank?.beneficiary_sync_status ?? "pending",
      verification_status,
      verification_error,
      blocking,
    });
  }

  const walletBalance = await getWalletBalance();
  const shortfall = walletBalance != null ? totalPayable - walletBalance : null;
  const blockingCount = items.filter((i) => i.blocking).length;
  const ready = blockingCount === 0 && (shortfall == null || shortfall <= 0);

  await logAudit(user.orgId, null, user.employeeId ?? null, user.role, "preflight_run", {
    run_id: runId,
    total_payable: totalPayable,
    wallet_balance: walletBalance,
    blocking_count: blockingCount,
  });

  return {
    success: true,
    data: {
      run_id: runId,
      total_payable: totalPayable,
      wallet_balance: walletBalance,
      shortfall,
      items,
      blocking_count: blockingCount,
      ready_to_initiate: ready,
    },
  };
}

// ---- initiateDisbursement ----

const InitiateSchema = z.object({
  override_wallet_shortfall: z.boolean().default(false),
});

export async function initiateDisbursement(
  runId: string,
  opts: z.infer<typeof InitiateSchema> = { override_wallet_shortfall: false }
): Promise<ActionResult<{ batch_id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can initiate disbursement" };

  // Re-run preflight to ensure freshness
  const preflight = await runPreflight(runId);
  if (!preflight.success) return { success: false, error: preflight.error };

  if (preflight.data.blocking_count > 0) {
    return {
      success: false,
      error: `${preflight.data.blocking_count} employee(s) have blocking issues. Resolve them first.`,
    };
  }

  if (preflight.data.shortfall != null && preflight.data.shortfall > 0 && !opts.override_wallet_shortfall) {
    return {
      success: false,
      error: `Wallet shortfall of ₹${preflight.data.shortfall.toLocaleString("en-IN")}. Fund the wallet or override.`,
    };
  }

  const sb = createAdminSupabase();
  const idempotencyKey = randomUUID();

  // Insert batch
  const { data: batch, error: batchErr } = await sb
    .from("disbursement_batches")
    .insert({
      org_id: user.orgId,
      payroll_run_id: runId,
      status: "awaiting_approval",
      total_amount: preflight.data.total_payable,
      override_wallet_shortfall: opts.override_wallet_shortfall,
      idempotency_key: idempotencyKey,
      maker_id: user.employeeId ?? null,
    } as any)
    .select("id")
    .single();

  if (batchErr || !batch) return { success: false, error: batchErr?.message ?? "Failed to create batch" };
  const batchId = (batch as { id: string }).id;

  // Insert items
  const itemRows = preflight.data.items.map((it) => ({
    org_id: user.orgId,
    batch_id: batchId,
    payroll_entry_id: null as string | null, // we don't have payroll_entry_id in preflight items; need to look up
    employee_id: it.employee_id,
    fund_account_id: it.fund_account_id!,
    amount: it.amount,
    status: "pending",
  }));

  // Fix: we need payroll_entry_id per item. Look up.
  const { data: entries } = await sb
    .from("payroll_entries")
    .select("id, employee_id")
    .eq("payroll_run_id", runId)
    .eq("org_id", user.orgId);
  const entryByEmp = new Map<string, string>();
  for (const e of (entries ?? []) as any[]) entryByEmp.set(e.employee_id, e.id);

  const filledRows = itemRows
    .map((r) => ({ ...r, payroll_entry_id: entryByEmp.get(r.employee_id) ?? null }))
    .filter((r) => r.payroll_entry_id != null) as Array<typeof itemRows[number] & { payroll_entry_id: string }>;

  if (filledRows.length === 0) {
    // Clean up the orphan batch
    await sb.from("disbursement_batches").delete().eq("id", batchId);
    return { success: false, error: "No payroll entries found to disburse" };
  }

  const { error: itemsErr } = await sb.from("disbursement_items").insert(filledRows as any);
  if (itemsErr) {
    await sb.from("disbursement_batches").delete().eq("id", batchId);
    return { success: false, error: itemsErr.message };
  }

  // Flip payroll_runs.status to 'disbursing'
  await sb
    .from("payroll_runs")
    .update({ status: "disbursing" } as any)
    .eq("id", runId)
    .eq("org_id", user.orgId);

  await logAudit(user.orgId, batchId, user.employeeId ?? null, user.role, "initiate", {
    total: preflight.data.total_payable,
    item_count: filledRows.length,
    override_wallet_shortfall: opts.override_wallet_shortfall,
  });

  revalidatePath("/dashboard/payroll");
  return { success: true, data: { batch_id: batchId } };
}

// ---- Read helpers used by UI ----

export async function getDisbursementBatchByRun(runId: string): Promise<ActionResult<{
  batch: any | null;
  items: any[];
} | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role) && user.role !== "manager") return { success: false, error: "Unauthorized" };

  const sb = createAdminSupabase();
  const { data: batch } = await sb
    .from("disbursement_batches")
    .select("*")
    .eq("payroll_run_id", runId)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!batch) return { success: true, data: { batch: null, items: [] } };

  const { data: items } = await sb
    .from("disbursement_items")
    .select("*, employees!employee_id(first_name, last_name)")
    .eq("batch_id", (batch as any).id)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: true });

  return { success: true, data: { batch, items: items ?? [] } };
}

// ---- approveDisbursement ----

/**
 * Checker action: approves a batch in `awaiting_approval` status, calls
 * RazorpayX bulk payout API, and updates per-item statuses with the response.
 *
 * Maker-checker enforcement:
 *   - The caller must be a different employee than `batch.maker_id`
 *     UNLESS `razorpayx_credentials.single_person_approval_allowed === true`.
 *
 * RazorpayX call strategy:
 *   1. Try `createBulkPayout` (single API call for all items)
 *   2. If it fails with 404 / endpoint_unsupported, fall back to looping
 *      `createPayout` per item with a derived idempotency key (`${batch.idempotency_key}-${index}`)
 *
 * Status mapping after the API call (per RazorpayX payout entity status):
 *   - `queued` / `pending` / `processing` → disbursement_items.status = 'queued' or 'processing'
 *   - `processed` → 'paid'
 *   - `rejected` / `cancelled` / `failed` / `reversed` → 'failed'
 * Real-time status updates beyond the initial response come via the webhook (P25).
 */
export async function approveDisbursement(
  batchId: string,
): Promise<ActionResult<{ status: string; pushed: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can approve disbursement" };

  const sb = createAdminSupabase();

  // 1. Load batch + verify status
  const { data: batch } = await sb
    .from("disbursement_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!batch) return { success: false, error: "Batch not found" };
  const b = batch as any;
  if (b.status !== "awaiting_approval") {
    return { success: false, error: `Batch is in '${b.status}' state and cannot be approved` };
  }

  // 2. Load credentials
  const { data: creds } = await sb
    .from("razorpayx_credentials")
    .select("key_id, key_secret_encrypted, account_id, account_number, single_person_approval_allowed")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!creds) return { success: false, error: "RazorpayX not connected" };
  const c = creds as any;

  // 3. Maker-checker
  if (b.maker_id && user.employeeId && b.maker_id === user.employeeId && !c.single_person_approval_allowed) {
    return { success: false, error: "A different admin must approve this batch (maker-checker)" };
  }

  // 4. Load items
  const { data: items } = await sb
    .from("disbursement_items")
    .select("id, employee_id, fund_account_id, amount, status")
    .eq("batch_id", batchId)
    .eq("org_id", user.orgId);
  if (!items || items.length === 0) {
    return { success: false, error: "Batch has no items" };
  }

  // 5. Update batch: approved -> processing (after RazorpayX call, but we set approved metadata now)
  await sb
    .from("disbursement_batches")
    .update({
      status: "approved",
      checker_id: user.employeeId ?? null,
      approved_at: new Date().toISOString(),
    } as any)
    .eq("id", batchId);

  await logAudit(user.orgId, batchId, user.employeeId ?? null, user.role, "approve", {
    item_count: items.length,
    single_person: b.maker_id === user.employeeId,
  });

  // 6. Build RazorpayX client + payout payload
  const client = createRazorpayXClient({
    key_id: c.key_id,
    key_secret_encrypted: c.key_secret_encrypted,
    account_id: c.account_id,
    account_number: c.account_number,
  });

  type Item = { id: string; employee_id: string; fund_account_id: string; amount: number; status: string };
  const itemList = items as unknown as Item[];

  type StatusMap = "queued" | "processing" | "paid" | "failed";
  function mapStatus(razorpayxStatus: PayoutResponse["status"]): StatusMap {
    switch (razorpayxStatus) {
      case "queued":
      case "pending":
        return "queued";
      case "processing":
        return "processing";
      case "processed":
        return "paid";
      case "rejected":
      case "cancelled":
      case "failed":
      case "reversed":
        return "failed";
      default:
        return "queued";
    }
  }

  // 7. Try bulk payout first
  let pushed = 0;
  let failed = 0;
  const bulkResult = await createBulkPayout(
    client,
    {
      account_number: c.account_number,
      items: itemList.map((it) => ({
        fund_account_id: it.fund_account_id,
        amount: it.amount * 100, // paise
        currency: "INR",
        mode: "IMPS",
        purpose: "salary",
        reference_id: it.id,
        narration: "Salary",
      })),
    },
    b.idempotency_key,
  );

  let usedFallback = false;
  const perItemResults: Array<{ item_id: string; payout?: PayoutResponse; error?: string }> = [];

  if (bulkResult.ok) {
    // Map response items to our items by reference_id
    const payoutByRef = new Map<string, PayoutResponse>();
    for (const p of bulkResult.data.items ?? []) {
      if ((p as any).reference_id) payoutByRef.set((p as any).reference_id, p);
    }
    for (const it of itemList) {
      const payout = payoutByRef.get(it.id);
      if (payout) perItemResults.push({ item_id: it.id, payout });
      else perItemResults.push({ item_id: it.id, error: "No payout returned for this item in bulk response" });
    }
    if (b.razorpayx_batch_id == null && bulkResult.data.id) {
      await sb
        .from("disbursement_batches")
        .update({ razorpayx_batch_id: bulkResult.data.id } as any)
        .eq("id", batchId);
    }
  } else {
    // Bulk failed — fall back to per-item createPayout
    usedFallback = true;
    for (let i = 0; i < itemList.length; i++) {
      const it = itemList[i];
      const itemIdempotency = `${b.idempotency_key}-${i}`;
      const r = await createPayout(
        client,
        {
          account_number: c.account_number,
          fund_account_id: it.fund_account_id,
          amount: it.amount * 100,
          currency: "INR",
          mode: "IMPS",
          purpose: "salary",
          reference_id: it.id,
          narration: "Salary",
        },
        itemIdempotency,
      );
      if (r.ok) perItemResults.push({ item_id: it.id, payout: r.data });
      else perItemResults.push({ item_id: it.id, error: r.error.description });
    }
  }

  // 8. Persist per-item statuses
  for (const result of perItemResults) {
    if (result.payout) {
      const mappedStatus = mapStatus(result.payout.status);
      await sb
        .from("disbursement_items")
        .update({
          status: mappedStatus,
          razorpayx_payout_id: result.payout.id,
          failure_reason: result.payout.failure_reason ?? null,
          fee_paise: result.payout.fees ?? 0,
        } as any)
        .eq("id", result.item_id);
      if (mappedStatus === "paid") pushed++;
      else if (mappedStatus === "failed") failed++;
      else pushed++; // queued/processing count as "pushed successfully to RazorpayX"
    } else {
      await sb
        .from("disbursement_items")
        .update({
          status: "failed",
          failure_reason: result.error ?? "Unknown error",
        } as any)
        .eq("id", result.item_id);
      failed++;
    }
  }

  // 9. Persist the batch-level total_fees_paise aggregate (not derivable from items).
  const totalFeesPaise = perItemResults.reduce((s, r) => s + (r.payout?.fees ?? 0), 0);
  await sb
    .from("disbursement_batches")
    .update({ total_fees_paise: totalFeesPaise } as any)
    .eq("id", batchId);

  // Reconcile batch.status + payroll_runs.status from the item aggregate (single source of truth).
  await reconcileBatchAndRunStatus(sb, batchId, user.orgId);

  await logAudit(user.orgId, batchId, user.employeeId ?? null, user.role, "approve", {
    razorpayx_call: usedFallback ? "fallback_per_item" : "bulk",
    pushed,
    failed,
  });

  revalidatePath("/dashboard/payroll");

  // Re-fetch the reconciled batch status to populate the return value.
  const { data: finalBatch } = await sb
    .from("disbursement_batches")
    .select("status")
    .eq("id", batchId)
    .maybeSingle();
  return {
    success: true,
    data: { status: (finalBatch as any)?.status ?? "processing", pushed, failed },
  };
}

// ---- retryFailedPayouts ----

/**
 * Admin-initiated retry of items in `failed` status within a batch.
 * Per-item createPayout with a derived idempotency key that includes the
 * retry_count (so RazorpayX treats it as a new request after the previous
 * failure).
 */
export async function retryFailedPayouts(
  batchId: string,
): Promise<ActionResult<{ retried: number; succeeded: number; still_failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can retry payouts" };

  const sb = createAdminSupabase();

  // Load batch
  const { data: batch } = await sb
    .from("disbursement_batches")
    .select("*")
    .eq("id", batchId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!batch) return { success: false, error: "Batch not found" };
  const b = batch as any;
  if (b.status === "completed") {
    return { success: false, error: "Batch already completed — nothing to retry" };
  }
  if (b.status === "cancelled") {
    return { success: false, error: "Cancelled batches cannot be retried" };
  }

  // Load credentials
  const { data: creds } = await sb
    .from("razorpayx_credentials")
    .select("key_id, key_secret_encrypted, account_id, account_number")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!creds) return { success: false, error: "RazorpayX not connected" };

  // Find failed items
  const { data: failedItems } = await sb
    .from("disbursement_items")
    .select("id, employee_id, fund_account_id, amount, retry_count")
    .eq("batch_id", batchId)
    .eq("org_id", user.orgId)
    .eq("status", "failed");

  const items = (failedItems ?? []) as any[];
  if (items.length === 0) {
    return { success: false, error: "No failed items to retry" };
  }

  const client = createRazorpayXClient(creds as any);

  let succeeded = 0;
  let stillFailed = 0;

  for (const it of items) {
    const newRetryCount = (it.retry_count ?? 0) + 1;
    const idempotencyKey = `${b.idempotency_key}-retry-${it.id}-${newRetryCount}`;

    const r = await createPayout(
      client,
      {
        account_number: (creds as any).account_number,
        fund_account_id: it.fund_account_id,
        amount: it.amount * 100, // paise
        currency: "INR",
        mode: "IMPS",
        purpose: "salary",
        reference_id: it.id,
        narration: "Salary (retry)",
      },
      idempotencyKey,
    );

    if (r.ok) {
      const status = r.data.status;
      const mapped: string =
        status === "processed"
          ? "paid"
          : status === "queued" || status === "pending"
            ? "queued"
            : status === "processing"
              ? "processing"
              : "failed";
      await sb
        .from("disbursement_items")
        .update({
          status: mapped,
          razorpayx_payout_id: r.data.id,
          failure_reason: r.data.failure_reason ?? null,
          fee_paise: r.data.fees ?? 0,
          retry_count: newRetryCount,
        } as any)
        .eq("id", it.id);
      if (mapped === "paid" || mapped === "queued" || mapped === "processing") {
        succeeded++;
      } else {
        stillFailed++;
      }
    } else {
      await sb
        .from("disbursement_items")
        .update({
          status: "failed",
          failure_reason: r.error.description,
          retry_count: newRetryCount,
        } as any)
        .eq("id", it.id);
      stillFailed++;
    }
  }

  // Reconcile batch + run status based on the full item aggregate (centralized helper).
  await reconcileBatchAndRunStatus(sb, batchId, user.orgId);

  await logAudit(user.orgId, batchId, user.employeeId ?? null, user.role, "retry", {
    retried: items.length,
    succeeded,
    still_failed: stillFailed,
  });

  revalidatePath("/dashboard/payroll");
  return {
    success: true,
    data: { retried: items.length, succeeded, still_failed: stillFailed },
  };
}
