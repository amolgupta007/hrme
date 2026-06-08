"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { encrypt } from "@/lib/crypto/aes-gcm";
import { createRazorpayXClient, pingConnection } from "@/lib/razorpayx";
import type { ActionResult } from "@/types";

// ---- Masked view (NEVER includes plaintext secrets) ----

export type MaskedRazorpayXCredentials = {
  id: string;
  key_id_masked: string; // e.g. "rzp_test_****1234"
  account_id: string;
  account_number_masked: string; // "****1234"
  is_test_mode: boolean;
  single_person_approval_allowed: boolean;
  connected_by_name: string | null;
  connected_at: string;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  updated_at: string;
};

const ConnectSchema = z.object({
  key_id: z
    .string()
    .regex(
      /^rzp_(test|live)_[A-Za-z0-9]+$/,
      "Invalid RazorpayX key_id (must start with rzp_test_ or rzp_live_)",
    ),
  key_secret: z.string().min(20).max(120),
  webhook_secret: z.string().min(8).max(120),
  account_id: z.string().min(8),
  account_number: z.string().min(8).max(20),
  is_test_mode: z.boolean(),
});

function maskKeyId(keyId: string): string {
  const m = keyId.match(/^(rzp_(?:test|live)_)(.+)$/);
  if (!m) return "****";
  const [, prefixPart, body] = m;
  if (body.length <= 4) return `${prefixPart}****`;
  return `${prefixPart}****${body.slice(-4)}`;
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return "****";
  return "****" + accountNumber.slice(-4);
}

// ---- Get (masked) ----

export async function getRazorpayXCredentials(): Promise<
  ActionResult<MaskedRazorpayXCredentials | null>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role))
    return { success: false, error: "Only admins can view RazorpayX credentials" };

  const sb = createAdminSupabase();
  const { data, error } = await sb
    .from("razorpayx_credentials")
    .select(
      `
      id, key_id, account_id, account_number, is_test_mode, single_person_approval_allowed,
      connected_at, last_test_at, last_test_ok, last_test_error, updated_at,
      employees!connected_by(first_name, last_name)
    `,
    )
    .eq("org_id", user.orgId)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: true, data: null };

  const row = data as any;
  return {
    success: true,
    data: {
      id: row.id,
      key_id_masked: maskKeyId(row.key_id),
      account_id: row.account_id,
      account_number_masked: maskAccountNumber(row.account_number),
      is_test_mode: row.is_test_mode,
      single_person_approval_allowed: row.single_person_approval_allowed,
      connected_by_name: row.employees
        ? `${row.employees.first_name} ${row.employees.last_name}`
        : null,
      connected_at: row.connected_at,
      last_test_at: row.last_test_at,
      last_test_ok: row.last_test_ok,
      last_test_error: row.last_test_error,
      updated_at: row.updated_at,
    },
  };
}

// ---- Connect (upsert) ----

export async function connectRazorpayX(
  input: z.infer<typeof ConnectSchema>,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role))
    return { success: false, error: "Only admins can connect RazorpayX" };

  const parsed = ConnectSchema.safeParse(input);
  if (!parsed.success)
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // Cross-check: if key_id starts with rzp_live_ but is_test_mode=true, reject.
  const liveKey = parsed.data.key_id.startsWith("rzp_live_");
  if (liveKey && parsed.data.is_test_mode) {
    return { success: false, error: "Live keys cannot be saved in test mode" };
  }
  if (!liveKey && !parsed.data.is_test_mode) {
    return { success: false, error: "Test keys cannot be saved in live mode" };
  }

  const sb = createAdminSupabase();
  const { error } = await sb.from("razorpayx_credentials").upsert(
    {
      org_id: user.orgId,
      key_id: parsed.data.key_id,
      key_secret_encrypted: encrypt(parsed.data.key_secret),
      webhook_secret_encrypted: encrypt(parsed.data.webhook_secret),
      account_id: parsed.data.account_id,
      account_number: parsed.data.account_number,
      is_test_mode: parsed.data.is_test_mode,
      connected_by: user.employeeId ?? null,
      connected_at: new Date().toISOString(),
    } as any,
    { onConflict: "org_id" },
  );

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---- Disconnect ----

export async function disconnectRazorpayX(): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role))
    return { success: false, error: "Only admins can disconnect RazorpayX" };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("razorpayx_credentials")
    .delete()
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---- Update single-person approval flag ----

export async function setSinglePersonApproval(
  allowed: boolean,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role))
    return { success: false, error: "Only admins can change approval settings" };

  const sb = createAdminSupabase();
  const { error } = await sb
    .from("razorpayx_credentials")
    .update({ single_person_approval_allowed: allowed } as any)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---- Test connection ----

export async function testRazorpayXConnection(): Promise<
  ActionResult<{ ok: boolean; error?: string }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role))
    return { success: false, error: "Only admins can test RazorpayX connection" };

  const sb = createAdminSupabase();
  const { data: creds, error: fetchErr } = await sb
    .from("razorpayx_credentials")
    .select("key_id, key_secret_encrypted, account_id, account_number")
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (fetchErr) return { success: false, error: fetchErr.message };
  if (!creds) return { success: false, error: "RazorpayX not connected" };

  const client = createRazorpayXClient(creds as any);
  const result = await pingConnection(client);

  const errorMessage = result.ok ? null : result.error.description;

  // Record test outcome regardless of success.
  await sb
    .from("razorpayx_credentials")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: result.ok,
      last_test_error: errorMessage,
    } as any)
    .eq("org_id", user.orgId);

  revalidatePath("/dashboard/settings");

  if (result.ok) return { success: true, data: { ok: true } };
  return { success: true, data: { ok: false, error: errorMessage ?? "Unknown error" } };
}
