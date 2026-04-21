"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

export type FingerprintConfig = {
  enabled: boolean;
  device_token: string | null;
};

export type EmployeeWithDeviceCode = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  device_code: string | null;
};

// ---- Get current fingerprint config for the org ----
export async function getFingerprintConfig(): Promise<ActionResult<FingerprintConfig>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  if (error || !data) return { success: false, error: "Failed to load config" };

  const settings = (data as any).settings ?? {};
  return {
    success: true,
    data: {
      enabled: settings.fingerprint_enabled === true,
      device_token: settings.device_token ?? null,
    },
  };
}

// ---- Enable or disable fingerprint integration ----
export async function toggleFingerprintEnabled(
  enabled: boolean
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  // Fetch current settings to merge
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const current = (org as any)?.settings ?? {};
  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...current, fingerprint_enabled: enabled } })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---- Generate (or regenerate) the device token ----
export async function generateDeviceToken(): Promise<ActionResult<string>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const token = `dt_${randomBytes(16).toString("hex")}`;

  const supabase = createAdminSupabase();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", user.orgId)
    .single();

  const current = (org as any)?.settings ?? {};
  const { error } = await supabase
    .from("organizations")
    .update({ settings: { ...current, device_token: token } })
    .eq("id", user.orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/settings");
  return { success: true, data: token };
}

// ---- Set or clear the device_code for an employee ----
export async function updateEmployeeDeviceCode(
  employeeId: string,
  code: string | null
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("employees")
    .update({ device_code: code?.trim() || null })
    .eq("id", employeeId)
    .eq("org_id", user.orgId);

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "That device code is already assigned to another employee" };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/settings");
  return { success: true, data: undefined };
}

// ---- List employees with their device codes (for settings table) ----
export async function listEmployeesWithDeviceCodes(): Promise<
  ActionResult<EmployeeWithDeviceCode[]>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();
  const { data, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, device_code")
    .eq("org_id", user.orgId)
    .eq("status", "active")
    .order("first_name");

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((e: any) => ({
      id: e.id,
      first_name: e.first_name,
      last_name: e.last_name,
      email: e.email,
      device_code: e.device_code ?? null,
    })),
  };
}
