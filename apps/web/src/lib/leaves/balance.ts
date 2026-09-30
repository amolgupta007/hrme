// Plain module — NOT "use server" (gotcha #85): takes raw org/employee ids.
//
// Leave balances are DERIVED (the leave_balances table is dead): remaining =
// days_per_year − used, where "used" was only ever approved leave_requests in
// the calendar year. Since migration 111 an append-only leave_adjustments
// ledger also moves balances (e.g. a late-arrival penalty debits casual
// leave; a reversal credits it back). Every balance reader folds the ledger in
// through this module, expressed as "used days" so each caller's existing
// summing code stays unchanged:
//   adjustment −1 (debit)  → +1 used
//   adjustment +1 (credit) → −1 used

type Supabase = { from: (table: string) => any };

export type UsageRow = { employee_id: string; policy_id: string; days: number };

/** Net ledger movement for the year, as used-day rows (one per employee+policy). */
export function adjustmentsAsUsage(
  adjustments: Array<{ employee_id: string; policy_id: string; days: number | string }>
): UsageRow[] {
  const net = new Map<string, UsageRow>();
  for (const a of adjustments) {
    const key = `${a.employee_id}__${a.policy_id}`;
    const row = net.get(key) ?? { employee_id: a.employee_id, policy_id: a.policy_id, days: 0 };
    row.days -= Number(a.days);
    net.set(key, row);
  }
  return [...net.values()].filter((r) => r.days !== 0);
}

/**
 * Ledger usage for one calendar year. Pass employeeIds to scope; omit for the
 * whole org. Best-effort: if the ledger can't be read (e.g. the table isn't
 * there yet), returns [] so balances fall back to leave_requests alone.
 */
export async function loadLeaveAdjustmentUsage(
  supabase: Supabase,
  params: { orgId: string; year: number; employeeIds?: string[] }
): Promise<UsageRow[]> {
  if (params.employeeIds && params.employeeIds.length === 0) return [];
  let q = supabase
    .from("leave_adjustments")
    .select("employee_id, policy_id, days")
    .eq("org_id", params.orgId)
    .eq("year", params.year);
  if (params.employeeIds) q = q.in("employee_id", params.employeeIds);
  const { data, error } = await q;
  if (error || !data) return [];
  return adjustmentsAsUsage(data as any[]);
}

/** Sum used days per policy for one employee from approved-request + ledger rows. */
export function usedByPolicy(rows: Array<{ policy_id: string; days: number | string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.policy_id] = (out[r.policy_id] ?? 0) + Number(r.days);
  return out;
}

/**
 * Remaining balance of one employee for one policy right now — used by the
 * late-penalty ladder to split a deduction between CL and LOP. Same rules as
 * every balance card: calendar year, approved requests + ledger, clamped ≥ 0.
 */
export async function loadRemainingBalance(
  supabase: Supabase,
  params: { orgId: string; employeeId: string; policyId: string; daysPerYear: number; year: number }
): Promise<number> {
  const { orgId, employeeId, policyId, year } = params;
  const [{ data: approved }, ledger] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("policy_id, days")
      .eq("org_id", orgId)
      .eq("employee_id", employeeId)
      .eq("policy_id", policyId)
      .eq("status", "approved")
      .gte("start_date", `${year}-01-01`)
      .lte("end_date", `${year}-12-31`),
    loadLeaveAdjustmentUsage(supabase, { orgId, year, employeeIds: [employeeId] }),
  ]);
  const used = usedByPolicy([...((approved as any[]) ?? []), ...ledger])[policyId] ?? 0;
  return Math.max(0, params.daysPerYear - used);
}
