/**
 * Work-from-home rules — pure, no I/O. WFH is NOT a leave type: a WFH day is a
 * working day (they still clock in, lateness still applies). Office employees
 * get a monthly allowance of WFH days, each approved in advance by their
 * reporting manager; days beyond the allowance can still be requested but only
 * an owner/admin can approve them. Remote employees never need to ask.
 * Plan: docs/planning/2026-10-01-work-from-home-requests.md
 */

export type WorkArrangement = "office" | "hybrid" | "remote";

export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  office: "Office",
  hybrid: "Hybrid",
  remote: "Remote",
};

export function normalizeWorkArrangement(v: unknown): WorkArrangement {
  return v === "remote" || v === "hybrid" ? v : "office";
}

export type WfhPolicy = { enabled: boolean; monthlyAllowance: number };

export const DEFAULT_WFH_ALLOWANCE = 2;

/** organizations.settings → WFH policy (off unless an admin turns it on). */
export function normalizeWfhPolicy(orgSettings: unknown): WfhPolicy {
  const raw = (orgSettings as any)?.attendance?.wfh ?? {};
  const n = Number(raw.monthly_allowance);
  return {
    enabled: raw.enabled === true,
    monthlyAllowance: Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_WFH_ALLOWANCE,
  };
}

export const monthOf = (date: string) => date.slice(0, 7);

export type WfhPlanInput = {
  /** Requested days, YYYY-MM-DD (IST). */
  dates: string[];
  /** Today, YYYY-MM-DD (IST). Same-day requests are allowed. */
  today: string;
  arrangement: WorkArrangement;
  allowance: number;
  /** Days that already have a pending/approved WFH request for this employee. */
  activeDates: Set<string>;
  /** Days covered by this employee's pending/approved leave. */
  leaveDates: Set<string>;
};

export type WfhPlan =
  | { ok: true; rows: { date: string; overQuota: boolean }[] }
  | { ok: false; error: string };

/**
 * Validate a request and mark which days fall beyond the monthly allowance.
 * Pending + approved days count toward the allowance, so two people can't
 * both "fit" by requesting at once.
 */
export function planWfhRequest(input: WfhPlanInput): WfhPlan {
  if (input.arrangement === "remote") {
    return { ok: false, error: "You work remotely — no work-from-home request is needed." };
  }
  const dates = [...new Set(input.dates)].sort();
  if (dates.length === 0) return { ok: false, error: "Pick at least one day." };
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: `Invalid date: ${d}` };
    if (d < input.today) return { ok: false, error: "Work from home can't be requested for a past day." };
    if (input.activeDates.has(d)) return { ok: false, error: `You already have a request for ${d}.` };
    if (input.leaveDates.has(d)) return { ok: false, error: `You're on leave on ${d}.` };
  }

  const usedByMonth = new Map<string, number>();
  for (const d of input.activeDates) {
    usedByMonth.set(monthOf(d), (usedByMonth.get(monthOf(d)) ?? 0) + 1);
  }
  const rows = dates.map((date) => {
    const m = monthOf(date);
    const used = usedByMonth.get(m) ?? 0;
    usedByMonth.set(m, used + 1);
    return { date, overQuota: used >= input.allowance };
  });
  return { ok: true, rows };
}

/**
 * After a day is freed (cancelled / not approved), re-mark which PENDING days
 * of that month are beyond the allowance. Approved days hold their slots;
 * pending days fill the rest in date order. Returns ids whose flag changes.
 */
export function reflagOverQuota(
  rows: { id: string; date: string; status: string; over_quota: boolean }[],
  allowance: number,
): { id: string; overQuota: boolean }[] {
  const approved = rows.filter((r) => r.status === "approved").length;
  const pending = rows.filter((r) => r.status === "pending").sort((a, b) => a.date.localeCompare(b.date));
  const changes: { id: string; overQuota: boolean }[] = [];
  pending.forEach((r, i) => {
    const over = approved + i >= allowance;
    if (over !== r.over_quota) changes.push({ id: r.id, overQuota: over });
  });
  return changes;
}

/**
 * Who may approve/reject. Owners/admins: always. A reporting manager: only
 * their own report's days, and only within the allowance — beyond it the
 * admins decide.
 */
export function canDecideWfh(input: {
  actorRole: string;
  actorEmployeeId: string | null;
  employeeManagerIds: string[];
  overQuota: boolean;
}): boolean {
  if (input.actorRole === "owner" || input.actorRole === "admin") return true;
  if (!input.actorEmployeeId || input.overQuota) return false;
  return input.employeeManagerIds.includes(input.actorEmployeeId);
}
