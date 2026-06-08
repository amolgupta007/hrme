"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { encrypt, decrypt, hashSha256 } from "@/lib/crypto/aes-gcm";
import {
  createRazorpayXClient,
  createContact,
  createFundAccount,
} from "@/lib/razorpayx";
import type { ActionResult } from "@/types";

// ---- Public (masked) view ----

export type MaskedBankAccount = {
  id: string;
  employee_id: string;
  employee_name?: string; // for admin list view
  holder_name: string;
  account_number_last4: string;
  ifsc_first4: string;
  account_type: "savings" | "current";
  razorpayx_contact_id: string | null;
  razorpayx_fund_account_id: string | null;
  beneficiary_sync_status: "pending" | "synced" | "failed";
  beneficiary_sync_error: string | null;
  beneficiary_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

const BankAccountInputSchema = z.object({
  holder_name: z.string().min(2).max(120),
  account_number: z.string().regex(/^\d{9,18}$/, "Account number must be 9-18 digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC (e.g. FDRL0001234)"),
  account_type: z.enum(["savings", "current"]).default("savings"),
});

// Map a DB row to the masked public type. NEVER returns plaintext account_number / ifsc.
function toMasked(row: any, employeeName?: string): MaskedBankAccount {
  return {
    id: row.id,
    employee_id: row.employee_id,
    employee_name: employeeName,
    holder_name: row.holder_name,
    account_number_last4: row.account_number_last4,
    ifsc_first4: row.ifsc_first4,
    account_type: row.account_type,
    razorpayx_contact_id: row.razorpayx_contact_id ?? null,
    razorpayx_fund_account_id: row.razorpayx_fund_account_id ?? null,
    beneficiary_sync_status: row.beneficiary_sync_status,
    beneficiary_sync_error: row.beneficiary_sync_error ?? null,
    beneficiary_synced_at: row.beneficiary_synced_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildEncryptedFields(input: z.infer<typeof BankAccountInputSchema>) {
  const account = input.account_number;
  const ifsc = input.ifsc;
  return {
    account_number_encrypted: encrypt(account),
    account_number_last4: account.slice(-4),
    account_number_hash: hashSha256(`${ifsc}|${account}`),
    ifsc_encrypted: encrypt(ifsc),
    ifsc_first4: ifsc.slice(0, 4),
  };
}

// ---- Employee-facing: own bank account ----

export async function getMyBankAccount(): Promise<ActionResult<MaskedBankAccount | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: true, data: null };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employee_bank_accounts")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("employee_id", user.employeeId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, data: null };
  return { success: true, data: toMasked(data as any) };
}

export async function upsertMyBankAccount(input: z.infer<typeof BankAccountInputSchema>): Promise<ActionResult<MaskedBankAccount>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!user.employeeId) return { success: false, error: "No employee record found" };

  const parsed = BankAccountInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const sb = createAdminSupabase();
  const enc = buildEncryptedFields(parsed.data);
  const { data, error } = await sb
    .from("employee_bank_accounts")
    .upsert({
      org_id: user.orgId,
      employee_id: user.employeeId,
      holder_name: parsed.data.holder_name,
      ...enc,
      account_type: parsed.data.account_type,
      // Reset sync status on every save — new beneficiary needs re-creating in RazorpayX
      razorpayx_contact_id: null,
      razorpayx_fund_account_id: null,
      beneficiary_sync_status: "pending",
      beneficiary_sync_error: null,
      beneficiary_synced_at: null,
    } as any, { onConflict: "employee_id" })
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };
  // P14 will fire syncBeneficiary via waitUntil here.
  revalidatePath("/dashboard/profile");
  return { success: true, data: toMasked(data as any) };
}

// ---- Admin-facing: any employee ----

export async function getEmployeeBankAccount(employeeId: string): Promise<ActionResult<MaskedBankAccount | null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can view other employees' bank accounts" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employee_bank_accounts")
    .select("*")
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, data: null };
  return { success: true, data: toMasked(data as any) };
}

export async function upsertEmployeeBankAccount(employeeId: string, input: z.infer<typeof BankAccountInputSchema>): Promise<ActionResult<MaskedBankAccount>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can edit other employees' bank accounts" };

  const parsed = BankAccountInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const sb = createAdminSupabase();
  // Cross-tenant guard: employee must belong to caller's org.
  const { data: empOk } = await sb
    .from("employees")
    .select("id")
    .eq("org_id", user.orgId)
    .eq("id", employeeId)
    .maybeSingle();
  if (!empOk) return { success: false, error: "Employee not found in your organisation" };

  const enc = buildEncryptedFields(parsed.data);
  const { data, error } = await sb
    .from("employee_bank_accounts")
    .upsert({
      org_id: user.orgId,
      employee_id: employeeId,
      holder_name: parsed.data.holder_name,
      ...enc,
      account_type: parsed.data.account_type,
      razorpayx_contact_id: null,
      razorpayx_fund_account_id: null,
      beneficiary_sync_status: "pending",
      beneficiary_sync_error: null,
      beneficiary_synced_at: null,
    } as any, { onConflict: "employee_id" })
    .select("*")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/employees");
  return { success: true, data: toMasked(data as any) };
}

// ---- Admin list ----

export async function listAllBankAccounts(): Promise<ActionResult<MaskedBankAccount[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can list bank accounts" };
  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("employee_bank_accounts")
    .select("*, employees!employee_id(first_name, last_name)")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    data: (data ?? []).map((r: any) => {
      const name = r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "Unknown";
      return toMasked(r, name);
    }),
  };
}

// ---- RazorpayX beneficiary sync ----

/**
 * Creates RazorpayX Contact + Fund Account for an employee's bank account.
 * Updates beneficiary_sync_status + IDs back on the employee_bank_accounts row.
 * Best-effort; never throws — failures captured in beneficiary_sync_error.
 *
 * Called from:
 *   - waitUntil hook on bank-account save (P14)
 *   - resyncBeneficiary admin action (this file)
 *   - bulkSyncAllBeneficiaries admin action (this file)
 */
export async function syncBeneficiary(employeeId: string): Promise<ActionResult<void>> {
  const sb = createAdminSupabase();

  // 1. Look up the employee's bank account row + employee details (for name/email/phone) + the org's RazorpayX credentials.
  const { data: bankRow } = await sb
    .from("employee_bank_accounts")
    .select(`
      id, org_id, employee_id, holder_name,
      account_number_encrypted, ifsc_encrypted,
      employees!employee_id(first_name, last_name, email, phone)
    `)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (!bankRow) return { success: false, error: "No bank account on file" };

  const bank = bankRow as any;
  const orgId = bank.org_id;
  const employee = bank.employees;

  const { data: credsRow } = await sb
    .from("razorpayx_credentials")
    .select("key_id, key_secret_encrypted, account_id, account_number")
    .eq("org_id", orgId)
    .maybeSingle();

  if (!credsRow) {
    await sb.from("employee_bank_accounts")
      .update({
        beneficiary_sync_status: "failed",
        beneficiary_sync_error: "RazorpayX not connected for this org",
        beneficiary_synced_at: null,
      } as any)
      .eq("id", bank.id);
    return { success: false, error: "RazorpayX not connected" };
  }

  // 2. Decrypt bank account_number + ifsc for the API call.
  let accountNumber: string, ifsc: string;
  try {
    accountNumber = decrypt(bank.account_number_encrypted);
    ifsc = decrypt(bank.ifsc_encrypted);
  } catch (e: any) {
    await sb.from("employee_bank_accounts")
      .update({
        beneficiary_sync_status: "failed",
        beneficiary_sync_error: `Decryption failed: ${e?.message ?? "unknown"}`,
      } as any)
      .eq("id", bank.id);
    return { success: false, error: "Decryption failed" };
  }

  // 3. Build the RazorpayX client.
  const client = createRazorpayXClient(credsRow as any);

  // 4. Create Contact.
  const contactResult = await createContact(client, {
    name: bank.holder_name,
    email: employee?.email ?? undefined,
    contact: employee?.phone ?? undefined,
    type: "employee",
    reference_id: employeeId,
  });

  if (!contactResult.ok) {
    await sb.from("employee_bank_accounts")
      .update({
        beneficiary_sync_status: "failed",
        beneficiary_sync_error: `Contact creation failed: ${contactResult.error.description}`,
      } as any)
      .eq("id", bank.id);
    return { success: false, error: contactResult.error.description };
  }

  const contactId = contactResult.data.id;

  // 5. Create Fund Account.
  const fundAccountResult = await createFundAccount(client, {
    contact_id: contactId,
    account_type: "bank_account",
    bank_account: {
      name: bank.holder_name,
      ifsc,
      account_number: accountNumber,
    },
  });

  if (!fundAccountResult.ok) {
    await sb.from("employee_bank_accounts")
      .update({
        beneficiary_sync_status: "failed",
        beneficiary_sync_error: `Fund Account creation failed: ${fundAccountResult.error.description}`,
        razorpayx_contact_id: contactId, // save Contact even if FA failed; resync can retry
      } as any)
      .eq("id", bank.id);
    return { success: false, error: fundAccountResult.error.description };
  }

  // 6. Persist both IDs + mark synced.
  await sb.from("employee_bank_accounts")
    .update({
      razorpayx_contact_id: contactId,
      razorpayx_fund_account_id: fundAccountResult.data.id,
      beneficiary_sync_status: "synced",
      beneficiary_sync_error: null,
      beneficiary_synced_at: new Date().toISOString(),
    } as any)
    .eq("id", bank.id);

  return { success: true, data: undefined };
}

/** Admin re-sync of a single employee's beneficiary. */
export async function resyncBeneficiary(employeeId: string): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can re-sync beneficiaries" };
  // Cross-tenant guard via the employee_bank_accounts row's org_id check inside syncBeneficiary
  return syncBeneficiary(employeeId);
}

/** Bulk re-sync for all employees in the caller's org. */
export async function bulkSyncAllBeneficiaries(): Promise<ActionResult<{ synced: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Only admins can bulk re-sync" };

  const sb = createAdminSupabase();
  const { data: bankAccounts } = await sb
    .from("employee_bank_accounts")
    .select("employee_id")
    .eq("org_id", user.orgId);

  let synced = 0;
  let failed = 0;
  for (const row of (bankAccounts ?? []) as any[]) {
    const r = await syncBeneficiary(row.employee_id);
    if (r.success) synced++;
    else failed++;
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/employees");
  return { success: true, data: { synced, failed } };
}
