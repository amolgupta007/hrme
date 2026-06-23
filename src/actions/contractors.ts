"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import type { ActionResult } from "@/types";

const EngagementSchema = z.object({
  employee_id: z.string().uuid(),
  rate_type: z.enum(["hourly", "daily", "monthly", "milestone"]),
  rate_amount: z.number().nonnegative(),
  tds_section: z.enum(["194J", "194C"]),
  payee_type: z.enum(["individual_huf", "other"]).default("individual_huf"),
  has_pan: z.boolean().default(true),
  contract_start: z.string().nullable().optional(),
  contract_end: z.string().nullable().optional(),
  renewal_date: z.string().nullable().optional(),
});

export async function createContractorEngagement(
  input: z.infer<typeof EngagementSchema>
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = EngagementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = createAdminSupabase();

  // Guard: the target employee must belong to this org and be employment_type='contract'.
  const { data: emp } = await supabase
    .from("employees")
    .select("id, employment_type")
    .eq("id", parsed.data.employee_id)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!emp) return { success: false, error: "Employee not found in this org" };
  if ((emp as any).employment_type !== "contract")
    return { success: false, error: "Employee is not a contractor (set employment_type='contract' first)" };

  const { data, error } = await supabase
    .from("contractor_engagements")
    .insert({ org_id: user.orgId, ...parsed.data, status: "active" })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/contractors");
  return { success: true, data: { id: (data as any).id } };
}

export async function updateContractorEngagement(
  id: string,
  input: z.infer<typeof EngagementSchema>
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = EngagementSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = createAdminSupabase();
  const { error } = await supabase
    .from("contractor_engagements")
    .update(parsed.data)
    .eq("id", id)
    .eq("org_id", user.orgId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/contractors");
  return { success: true, data: undefined };
}

export async function listContractorEngagements(): Promise<ActionResult<any[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  // Fetch engagements with employee name/email (embedded join)
  const { data: engagements, error } = await supabase
    .from("contractor_engagements")
    .select(`
      id, employee_id, rate_type, rate_amount, tds_section, payee_type,
      has_pan, contract_start, contract_end, renewal_date, status,
      employees!employee_id ( first_name, last_name, email )
    `)
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };

  // Fetch bank beneficiary_sync_status in a separate query to avoid Supabase v2
  // never-inference on nested embeds (gotcha #3).
  const employeeIds = (engagements ?? []).map((r: any) => r.employee_id);
  const bankStatusMap = new Map<string, string>();
  if (employeeIds.length > 0) {
    const { data: banks } = await supabase
      .from("employee_bank_accounts")
      .select("employee_id, beneficiary_sync_status")
      .in("employee_id", employeeIds);
    for (const b of banks ?? []) {
      const row = b as any;
      bankStatusMap.set(row.employee_id, row.beneficiary_sync_status);
    }
  }

  const rows = (engagements ?? []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    email: r.employees?.email ?? null,
    rate_type: r.rate_type,
    rate_amount: r.rate_amount,
    tds_section: r.tds_section,
    payee_type: r.payee_type,
    has_pan: r.has_pan,
    contract_start: r.contract_start,
    contract_end: r.contract_end,
    renewal_date: r.renewal_date,
    status: r.status,
    bank_verified: bankStatusMap.get(r.employee_id) === "synced",
  }));
  return { success: true, data: rows };
}
