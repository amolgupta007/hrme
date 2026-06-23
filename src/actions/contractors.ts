"use server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { createAdminSupabase } from "@/lib/supabase/server";
import { computeContractorTDS } from "@/lib/contractor/tds";
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
  const { employee_id: _ignored, ...updateData } = parsed.data;
  const { error } = await supabase
    .from("contractor_engagements")
    .update(updateData)
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
      if (bankStatusMap.get(row.employee_id) === "synced") continue; // synced wins
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

// ---- payContractors ----

const PayContractorsSchema = z.object({
  items: z
    .array(
      z.object({
        engagement_id: z.string().uuid(),
        gross_amount: z.number().positive(),
      }),
    )
    .min(1),
});

export async function payContractors(
  input: z.infer<typeof PayContractorsSchema>,
): Promise<ActionResult<{ batchId: string }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const parsed = PayContractorsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };

  const supabase = createAdminSupabase();

  // Load engagements — verify they belong to this org.
  const engIds = parsed.data.items.map((i) => i.engagement_id);
  const { data: engs, error: engErr } = await supabase
    .from("contractor_engagements")
    .select("id, employee_id, tds_section, payee_type, has_pan, status")
    .eq("org_id", user.orgId)
    .in("id", engIds);
  if (engErr) return { success: false, error: engErr.message };
  const engById = new Map<string, any>((engs ?? []).map((e: any) => [e.id, e]));

  // Build per-item rows: compute TDS, verify synced fund account, store net amount in rupees.
  const itemRows: Array<{
    org_id: string;
    batch_id: string; // filled after batch insert
    contractor_engagement_id: string;
    payroll_entry_id: null;
    employee_id: string;
    fund_account_id: string;
    amount: number; // rupees — engine multiplies by 100 at dispatch (matches initiateDisbursement)
    status: "pending";
  }> = [];

  for (const it of parsed.data.items) {
    const eng = engById.get(it.engagement_id);
    if (!eng) return { success: false, error: `Engagement ${it.engagement_id} not found in this org` };
    if ((eng as any).status !== "active")
      return { success: false, error: `Engagement ${it.engagement_id} is not active` };

    // Verify bank account is synced (beneficiary must exist in RazorpayX).
    const { data: bank } = await supabase
      .from("employee_bank_accounts")
      .select("razorpayx_fund_account_id, beneficiary_sync_status")
      .eq("org_id", user.orgId)
      .eq("employee_id", (eng as any).employee_id)
      .maybeSingle();
    if (
      !(bank as any)?.razorpayx_fund_account_id ||
      (bank as any)?.beneficiary_sync_status !== "synced"
    ) {
      return {
        success: false,
        error: `Contractor bank account not verified/synced for engagement ${it.engagement_id}`,
      };
    }

    const { tds } = computeContractorTDS({
      amount: it.gross_amount,
      section: (eng as any).tds_section,
      payeeType: (eng as any).payee_type,
      hasPan: (eng as any).has_pan,
    });
    const net = Math.max(0, it.gross_amount - tds);

    itemRows.push({
      org_id: user.orgId,
      batch_id: "", // placeholder — filled after batch insert
      contractor_engagement_id: (eng as any).id,
      payroll_entry_id: null,
      employee_id: (eng as any).employee_id,
      fund_account_id: (bank as any).razorpayx_fund_account_id,
      amount: Math.round(net), // rupees — engine multiplies by 100 at dispatch (matches initiateDisbursement)
      status: "pending",
    });
  }

  // Total in rupees across all items.
  const totalAmount = itemRows.reduce((s, r) => s + r.amount, 0);

  // Insert the batch (kind='contractor', payroll_run_id=null).
  // Column set mirrors initiateDisbursement — uses `as any` cast for unknown-table TS workaround.
  const { data: batch, error: batchErr } = await supabase
    .from("disbursement_batches")
    .insert({
      org_id: user.orgId,
      kind: "contractor",
      status: "awaiting_approval",
      payroll_run_id: null,
      maker_id: user.employeeId ?? null,
      idempotency_key: randomUUID(),
      total_amount: totalAmount,
      total_fees_paise: 0,
      override_wallet_shortfall: false,
    } as any)
    .select("id")
    .single();
  if (batchErr || !batch) return { success: false, error: batchErr?.message ?? "Failed to create batch" };
  const batchId = (batch as any).id as string;

  // Insert items with the real batch_id.
  const { error: itemsErr } = await supabase
    .from("disbursement_items")
    .insert(itemRows.map((r) => ({ ...r, batch_id: batchId })) as any);
  if (itemsErr) {
    // Clean up the orphan batch on item-insert failure.
    await supabase.from("disbursement_batches").delete().eq("id", batchId);
    return { success: false, error: itemsErr.message };
  }

  revalidatePath("/dashboard/contractors");
  return { success: true, data: { batchId } };
}

// ---- listAssignableContractors ----
// Returns employees with employment_type='contract' that do NOT already have an
// active engagement — used by the Add Engagement dialog picker.

export async function listAssignableContractors(): Promise<
  ActionResult<Array<{ id: string; name: string; email: string | null }>>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (!isAdmin(user.role)) return { success: false, error: "Unauthorized" };

  const supabase = createAdminSupabase();

  // All contract employees in this org.
  const { data: contractEmps, error: empErr } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email")
    .eq("org_id", user.orgId)
    .eq("employment_type", "contract")
    .eq("status", "active");
  if (empErr) return { success: false, error: empErr.message };

  if (!contractEmps || contractEmps.length === 0) {
    return { success: true, data: [] };
  }

  // Employees that already have an active engagement.
  const allIds = contractEmps.map((e: any) => e.id);
  const { data: activeEngs } = await supabase
    .from("contractor_engagements")
    .select("employee_id")
    .eq("org_id", user.orgId)
    .eq("status", "active")
    .in("employee_id", allIds);

  const engagedIds = new Set((activeEngs ?? []).map((e: any) => e.employee_id));

  const rows = contractEmps
    .filter((e: any) => !engagedIds.has(e.id))
    .map((e: any) => ({
      id: e.id,
      name: `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim(),
      email: e.email ?? null,
    }));

  return { success: true, data: rows };
}
