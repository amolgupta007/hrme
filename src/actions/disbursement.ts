"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";
import { getCachedVerification, type PennyDropStatus } from "@/actions/penny-drop";

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
