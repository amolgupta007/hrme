"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { encrypt, hashSha256 } from "@/lib/crypto/aes-gcm";
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
