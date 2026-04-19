import { createAdminSupabase } from "@/lib/supabase/server";

export type OrgWithStats = {
  id: string;
  name: string;
  plan: "starter" | "growth" | "business";
  created_at: string;
  employee_count: number;
  owner_email: string | null;
};

export type SuperadminStats = {
  total: number;
  starter: number;
  growth: number;
  business: number;
  signupsThisWeek: number;
  signupsThisMonth: number;
};

export type UpsellReason = "near_limit" | "engaged_starter";

export type UpsellTarget = OrgWithStats & { reason: UpsellReason };

export async function getAllOrgsWithStats(): Promise<OrgWithStats[]> {
  const supabase = createAdminSupabase();

  // Fetch all orgs
  const { data: orgs, error: orgsError } = await supabase
    .from("organizations")
    .select("id, name, plan, created_at")
    .order("created_at", { ascending: false });

  if (orgsError || !orgs || orgs.length === 0) return [];

  const orgIds = orgs.map((o) => o.id);

  // Fetch active employee counts per org
  const { data: employees, error: empError } = await supabase
    .from("employees")
    .select("org_id")
    .eq("status", "active")
    .in("org_id", orgIds);
  if (empError) console.error("[superadmin-data] employee count query failed:", empError.message);

  // Fetch one owner/admin email per org (earliest created)
  const { data: adminEmployees, error: adminError } = await supabase
    .from("employees")
    .select("org_id, email, role, created_at")
    .in("role", ["owner", "admin"])
    .in("org_id", orgIds)
    .order("created_at", { ascending: true });
  if (adminError) console.error("[superadmin-data] owner email query failed:", adminError.message);

  // Build lookup maps
  const empCountMap: Record<string, number> = {};
  for (const emp of employees ?? []) {
    empCountMap[emp.org_id] = (empCountMap[emp.org_id] ?? 0) + 1;
  }

  const ownerEmailMap: Record<string, string> = {};
  for (const emp of adminEmployees ?? []) {
    if (!ownerEmailMap[emp.org_id]) {
      ownerEmailMap[emp.org_id] = emp.email;
    }
  }

  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    plan: org.plan as OrgWithStats["plan"],
    created_at: org.created_at,
    employee_count: empCountMap[org.id] ?? 0,
    owner_email: ownerEmailMap[org.id] ?? null,
  }));
}

export function computeStats(orgs: OrgWithStats[]): SuperadminStats {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    total: orgs.length,
    starter: orgs.filter((o) => o.plan === "starter").length,
    growth: orgs.filter((o) => o.plan === "growth").length,
    business: orgs.filter((o) => o.plan === "business").length,
    signupsThisWeek: orgs.filter((o) => new Date(o.created_at) >= weekAgo).length,
    signupsThisMonth: orgs.filter((o) => new Date(o.created_at) >= monthAgo).length,
  };
}

export function getUpsellTargets(orgs: OrgWithStats[]): UpsellTarget[] {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const targets: UpsellTarget[] = [];

  for (const org of orgs) {
    if (org.plan !== "starter") continue;

    if (org.employee_count >= 7) {
      targets.push({ ...org, reason: "near_limit" });
    } else if (
      org.employee_count >= 3 &&
      new Date(org.created_at) <= thirtyDaysAgo
    ) {
      targets.push({ ...org, reason: "engaged_starter" });
    }
  }

  // Sort by employee_count descending
  return targets.sort((a, b) => b.employee_count - a.employee_count);
}
