"use server";

import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createRazorpayXClient, verifyFundAccount } from "@/lib/razorpayx";
import type { ActionResult } from "@/types";

export type PennyDropStatus = "verified" | "name_mismatch" | "invalid_account" | "unsupported_bank" | "error";

export type PennyDropResult = {
  status: PennyDropStatus;
  verified_at: string;
  registered_holder_name: string | null;
  declared_holder_name: string;
  name_match_score: number | null;
  error_message: string | null;
  cached: boolean;
};

/**
 * Verifies an employee's bank beneficiary via RazorpayX penny-drop.
 * Uses a 30-day cache keyed by (org_id, account_hash). Cache miss / expired
 * triggers a fresh API call; success caches the result.
 *
 * @param force - bypass cache and re-verify
 */
export async function verifyEmployeeBeneficiary(employeeId: string, force = false): Promise<ActionResult<PennyDropResult>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can verify beneficiaries" };

  const sb = createAdminSupabase();

  // 1. Look up the employee's bank account.
  const { data: bank } = await sb
    .from("employee_bank_accounts")
    .select("org_id, holder_name, account_number_hash, razorpayx_fund_account_id, beneficiary_sync_status")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (!bank) return { success: false, error: "No bank account on file for this employee" };
  if ((bank as any).org_id !== user.orgId) return { success: false, error: "Employee not in your organisation" };

  const b = bank as any;
  if (!b.razorpayx_fund_account_id) {
    return { success: false, error: "Beneficiary not synced to RazorpayX yet — run sync first" };
  }

  // 2. Check cache (unless force).
  if (!force) {
    const { data: cached } = await sb
      .from("penny_drop_results")
      .select("status, verified_at, registered_holder_name, declared_holder_name, name_match_score, expires_at, raw_response")
      .eq("org_id", user.orgId)
      .eq("account_hash", b.account_number_hash)
      .maybeSingle();
    if (cached) {
      const c = cached as any;
      if (new Date(c.expires_at) > new Date()) {
        return {
          success: true,
          data: {
            status: c.status as PennyDropStatus,
            verified_at: c.verified_at,
            registered_holder_name: c.registered_holder_name,
            declared_holder_name: c.declared_holder_name,
            name_match_score: c.name_match_score != null ? Number(c.name_match_score) : null,
            error_message: c.status === "error" ? "Cached error" : null,
            cached: true,
          },
        };
      }
    }
  }

  // 3. Fetch credentials + run the API call.
  const { data: creds } = await sb
    .from("razorpayx_credentials")
    .select("key_id, key_secret_encrypted, account_id, account_number")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!creds) return { success: false, error: "RazorpayX not connected" };

  const client = createRazorpayXClient(creds as any);
  const apiResult = await verifyFundAccount(client, {
    fund_account: { id: b.razorpayx_fund_account_id },
    amount: 100, // ₹1 in paise
    currency: "INR",
  });

  // 4. Map to our PennyDropStatus.
  let status: PennyDropStatus;
  let registeredName: string | null = null;
  let nameMatchScore: number | null = null;
  let errorMessage: string | null = null;

  if (!apiResult.ok) {
    status = "error";
    errorMessage = apiResult.error.description;
  } else {
    const v = apiResult.data;
    const apiStatus = v.results?.account_status;
    registeredName = v.results?.registered_name ?? null;
    if (v.status === "failed") {
      // RazorpayX surfaces the reason via account_status; map common cases
      if (apiStatus === "invalid") status = "invalid_account";
      else status = "error";
      errorMessage = `Validation failed: ${apiStatus ?? "unknown"}`;
    } else if (apiStatus === "active") {
      // Simple name match heuristic: case-insensitive substring or Levenshtein.
      // For Phase 2 v1, do a lowercased exact comparison; if registered name is
      // available and differs, flag as name_mismatch. Admins can override.
      if (registeredName && b.holder_name && registeredName.toLowerCase().trim() !== b.holder_name.toLowerCase().trim()) {
        status = "name_mismatch";
        nameMatchScore = 0; // crude; real Levenshtein could be added later
      } else {
        status = "verified";
        nameMatchScore = 1;
      }
    } else {
      // Account status unknown / not yet completed
      status = "error";
      errorMessage = `Unclear status: ${apiStatus ?? v.status}`;
    }
  }

  // 5. Upsert into cache (always, even error — so retries don't hammer the API).
  await sb.from("penny_drop_results").upsert({
    org_id: user.orgId,
    account_hash: b.account_number_hash,
    fund_account_id: b.razorpayx_fund_account_id,
    verified_at: new Date().toISOString(),
    status,
    registered_holder_name: registeredName,
    declared_holder_name: b.holder_name,
    name_match_score: nameMatchScore,
    raw_response: apiResult.ok ? apiResult.data : { error: apiResult.error },
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  } as any, { onConflict: "org_id,account_hash" });

  return {
    success: true,
    data: {
      status,
      verified_at: new Date().toISOString(),
      registered_holder_name: registeredName,
      declared_holder_name: b.holder_name,
      name_match_score: nameMatchScore,
      error_message: errorMessage,
      cached: false,
    },
  };
}

/** Get the cached verification for an employee without triggering a new check. */
export async function getCachedVerification(employeeId: string): Promise<ActionResult<PennyDropResult | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can read verifications" };

  const sb = createAdminSupabase();
  const { data: bank } = await sb
    .from("employee_bank_accounts")
    .select("org_id, holder_name, account_number_hash")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!bank || (bank as any).org_id !== user.orgId) return { success: true, data: null };

  const { data: cached } = await sb
    .from("penny_drop_results")
    .select("status, verified_at, registered_holder_name, declared_holder_name, name_match_score, expires_at")
    .eq("org_id", user.orgId)
    .eq("account_hash", (bank as any).account_number_hash)
    .maybeSingle();
  if (!cached) return { success: true, data: null };

  const c = cached as any;
  const isExpired = new Date(c.expires_at) <= new Date();
  return {
    success: true,
    data: {
      status: c.status as PennyDropStatus,
      verified_at: c.verified_at,
      registered_holder_name: c.registered_holder_name,
      declared_holder_name: c.declared_holder_name,
      name_match_score: c.name_match_score != null ? Number(c.name_match_score) : null,
      error_message: isExpired ? "Cache expired" : null,
      cached: true,
    },
  };
}
