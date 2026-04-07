"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import type { ActionResult } from "@/types";

export type GrievanceRecord = {
  id: string;
  org_id: string;
  employee_id: string | null;
  type: "complaint" | "suggestion";
  category: "facilities" | "environment" | "interpersonal" | "safety" | "policy" | "suggestion" | "other";
  severity: "low" | "medium" | "high" | "urgent";
  title: string;
  description: string;
  is_anonymous: boolean;
  tracking_token: string;
  status: "open" | "in_review" | "resolved" | "closed";
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string | null;
};

export type GrievanceStats = {
  total: number;
  open: number;
  in_review: number;
  resolved: number;
  urgent: number;
};

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let token = "GRV-";
  for (let i = 0; i < 6; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

const submitSchema = z.object({
  type: z.enum(["complaint", "suggestion"]),
  category: z.enum(["facilities", "environment", "interpersonal", "safety", "policy", "suggestion", "other"]),
  severity: z.enum(["low", "medium", "high", "urgent"]),
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(10, "Please provide more detail").max(2000),
  is_anonymous: z.boolean(),
});

export async function submitGrievance(
  input: z.infer<typeof submitSchema>
): Promise<ActionResult<{ tracking_token: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const validated = submitSchema.safeParse(input);
  if (!validated.success) return { success: false, error: validated.error.errors[0].message };

  const supabase = createAdminSupabase();

  // Generate a unique token (retry once on collision)
  let token = generateToken();
  const { data: existing } = await supabase
    .from("grievances")
    .select("id")
    .eq("tracking_token", token)
    .single();
  if (existing) token = generateToken();

  const { error } = await supabase.from("grievances").insert({
    org_id: user.orgId,
    employee_id: validated.data.is_anonymous ? null : user.employeeId,
    type: validated.data.type,
    category: validated.data.category,
    severity: validated.data.severity,
    title: validated.data.title,
    description: validated.data.description,
    is_anonymous: validated.data.is_anonymous,
    tracking_token: token,
    status: "open",
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/grievances");
  return { success: true, data: { tracking_token: token } };
}

export async function listGrievances(filters?: {
  status?: string;
  category?: string;
  severity?: string;
}): Promise<ActionResult<GrievanceRecord[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  // Only admins/owners see all; managers and employees only see their own (non-anonymous)
  const isAdminOrOwner = isAdmin(user.role);

  let query = supabase
    .from("grievances")
    .select("*, employees(first_name, last_name)")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  if (!isAdminOrOwner) {
    // Employees: only their own submissions
    query = query.eq("employee_id", user.employeeId ?? "");
  }

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.severity) query = query.eq("severity", filters.severity);

  const { data, error } = await query;
  if (error) return { success: false, error: error.message };

  const records: GrievanceRecord[] = (data ?? []).map((row: any) => ({
    ...row,
    employee_name: row.is_anonymous
      ? null
      : row.employees
      ? `${row.employees.first_name} ${row.employees.last_name}`
      : null,
    employees: undefined,
  }));

  return { success: true, data: records };
}

export async function updateGrievanceStatus(
  id: string,
  status: GrievanceRecord["status"],
  admin_notes?: string
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (admin_notes !== undefined) updates.admin_notes = admin_notes;
  if (status === "resolved" || status === "closed") {
    updates.resolved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("grievances")
    .update(updates)
    .eq("id", id)
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/grievances");
  return { success: true, data: undefined };
}

export async function getGrievanceByToken(
  token: string
): Promise<ActionResult<{ status: GrievanceRecord["status"]; admin_notes: string | null; title: string; created_at: string; updated_at: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("grievances")
    .select("status, admin_notes, title, created_at, updated_at")
    .eq("tracking_token", token.toUpperCase())
    .eq("org_id", user.orgId)
    .single();

  if (error || !data) return { success: false, error: "Token not found. Check the token and try again." };

  return { success: true, data: data as any };
}

export async function getGrievanceStats(): Promise<ActionResult<GrievanceStats>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  const { data, error } = await supabase
    .from("grievances")
    .select("status, severity")
    .eq("org_id", user.orgId);

  if (error) return { success: false, error: error.message };

  const rows = data ?? [];
  const stats: GrievanceStats = {
    total: rows.length,
    open: rows.filter((r: any) => r.status === "open").length,
    in_review: rows.filter((r: any) => r.status === "in_review").length,
    resolved: rows.filter((r: any) => r.status === "resolved" || r.status === "closed").length,
    urgent: rows.filter((r: any) => r.severity === "urgent" && r.status !== "resolved" && r.status !== "closed").length,
  };

  return { success: true, data: stats };
}
