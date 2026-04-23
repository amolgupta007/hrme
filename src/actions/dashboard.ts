"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import type { UserRole } from "@/types";

async function getClerkOrgId(): Promise<string | null> {
  const { orgId, userId } = auth();
  if (orgId) return orgId;
  if (!userId) return null;
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId });
  return memberships.data[0]?.organization.id ?? null;
}

// ---- Types ----

export type DashboardStats = {
  totalEmployees: number;
  pendingLeaves: number;
  trainingCompletion: number;
  complianceAlerts: number;
};

export type RecentLeave = {
  id: string;
  employee_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
};

export type UpcomingDeadline = {
  id: string;
  type: "training" | "review_cycle" | "objective";
  title: string;
  subtitle: string;
  due_date: string;
  urgency: "overdue" | "today" | "this_week" | "upcoming";
};

export type ActiveReviewCycle = {
  id: string;
  name: string;
  completed: number;
  total: number;
  end_date: string;
};

export type WhoIsOut = {
  id: string;
  name: string;
  leave_type: string;
  until: string; // end_date
  avatar_url: string | null;
};

export type LatestAnnouncement = {
  id: string;
  title: string;
  category: string;
  is_pinned: boolean;
  created_at: string;
};

export type MyLeaveBalance = {
  leave_type: string;
  total_days: number;
  used_days: number;
  remaining: number;
};

export type DashboardData = {
  stats: DashboardStats;
  recentLeaves: RecentLeave[];
  upcomingDeadlines: UpcomingDeadline[];
  activeReviewCycles: ActiveReviewCycle[];
  // New fields
  userRole: UserRole;
  userFirstName: string;
  whoIsOut: WhoIsOut[];
  latestAnnouncements: LatestAnnouncement[];
  pendingObjectivesCount: number;
  myLeaveBalances: MyLeaveBalance[];
  myPendingLeavesCount: number;
  myOverdueTrainingCount: number;
  grievancesCount: number;
};

// ---- Main action ----

export async function getDashboardStats() {
  const data = await getDashboardData();
  return data ? data.stats : null;
}

export async function getDashboardData(): Promise<DashboardData | null> {
  const clerkOrgId = await getClerkOrgId();
  if (!clerkOrgId) return null;

  const supabase = createAdminSupabase();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("clerk_org_id", clerkOrgId)
    .single();

  if (!org) return null;
  const orgId = (org as { id: string }).id;

  // Current user context
  const user = await getCurrentUser();
  const role: UserRole = user?.role ?? "employee";
  const employeeId = user?.employeeId ?? null;

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // ---- Parallel queries ----
  const [
    { count: totalEmployees },
    { count: pendingLeaves },
    { count: totalEnrollments },
    { count: completedEnrollments },
    { count: overdueEnrollments },
    leavesResult,
    trainingDueSoonResult,
    reviewCyclesResult,
    objectivePendingResult,
    whoIsOutResult,
    announcementsResult,
    grievancesResult,
  ] = await Promise.all([
    // Org-wide stats
    supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active"),
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending"),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "completed"),
    supabase
      .from("training_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "overdue"),

    // Recent leave requests (pending first, then latest)
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, days, status, created_at, employees!employee_id(first_name, last_name)")
      .eq("org_id", orgId)
      .order("status", { ascending: true }) // pending sorts before approved/rejected alphabetically? No — let's do two fields
      .order("created_at", { ascending: false })
      .limit(6),

    // Training deadlines in next 30 days
    supabase
      .from("training_courses")
      .select("id, title, due_date")
      .eq("org_id", orgId)
      .not("due_date", "is", null)
      .lte("due_date", in30Days)
      .order("due_date", { ascending: true })
      .limit(5),

    // Active review cycles
    supabase
      .from("review_cycles")
      .select("id, name, end_date")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("end_date", { ascending: true })
      .limit(3),

    // Pending objective approvals
    supabase
      .from("objectives")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "submitted"),

    // Who's out today
    supabase
      .from("leave_requests")
      .select("id, leave_type, end_date, employees!employee_id(first_name, last_name, avatar_url)")
      .eq("org_id", orgId)
      .eq("status", "approved")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("end_date", { ascending: true })
      .limit(8),

    // Latest announcements (pinned first)
    supabase
      .from("announcements")
      .select("id, title, category, is_pinned, created_at")
      .eq("org_id", orgId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2),

    // Grievances (open + in_review) — admin/owner only, but query always for simplicity
    supabase
      .from("grievances")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .in("status", ["open", "in_review"]),
  ]);

  // ---- Employee-specific queries (only when we have an employeeId) ----
  let myLeaveBalances: MyLeaveBalance[] = [];
  let myPendingLeavesCount = 0;
  let myOverdueTrainingCount = 0;
  let userFirstName = "";

  if (employeeId) {
    const [
      empResult,
      leaveBalancesResult,
      myPendingResult,
      myOverdueResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("first_name")
        .eq("id", employeeId)
        .single(),
      supabase
        .from("leave_balances")
        .select("total_days, used_days, carried_forward_days, leave_policies!policy_id(type)")
        .eq("org_id", orgId)
        .eq("employee_id", employeeId)
        .eq("year", now.getFullYear()),
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("employee_id", employeeId)
        .eq("status", "pending"),
      supabase
        .from("training_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("employee_id", employeeId)
        .eq("status", "overdue"),
    ]);

    userFirstName = (empResult.data as any)?.first_name ?? "";
    myPendingLeavesCount = myPendingResult.count ?? 0;
    myOverdueTrainingCount = myOverdueResult.count ?? 0;

    myLeaveBalances = (leaveBalancesResult.data ?? []).map((b: any) => {
      const total = (b.total_days ?? 0) + (b.carried_forward_days ?? 0);
      const used = b.used_days ?? 0;
      return {
        leave_type: b.leave_policies?.type ?? "unknown",
        total_days: total,
        used_days: used,
        remaining: Math.max(0, total - used),
      };
    });
  }

  const trainingPct =
    (totalEnrollments ?? 0) > 0
      ? Math.round(((completedEnrollments ?? 0) / (totalEnrollments ?? 1)) * 100)
      : 0;

  // Map recent leaves — sort pending to top
  const rawLeaves = (leavesResult.data ?? []).map((r: any) => ({
    id: r.id,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    leave_type: r.leave_type,
    start_date: r.start_date,
    end_date: r.end_date,
    days: r.days,
    status: r.status,
    created_at: r.created_at,
  })) as RecentLeave[];

  // Put pending first
  const recentLeaves = [
    ...rawLeaves.filter((l) => l.status === "pending"),
    ...rawLeaves.filter((l) => l.status !== "pending"),
  ].slice(0, 6);

  // Who's out today
  const whoIsOut: WhoIsOut[] = (whoIsOutResult.data ?? []).map((r: any) => ({
    id: r.id,
    name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    leave_type: r.leave_type,
    until: r.end_date,
    avatar_url: r.employees?.avatar_url ?? null,
  }));

  // Latest announcements
  const latestAnnouncements: LatestAnnouncement[] = (announcementsResult.data ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    category: a.category,
    is_pinned: a.is_pinned,
    created_at: a.created_at,
  }));

  // Build upcoming deadlines
  const deadlines: UpcomingDeadline[] = [];

  function urgency(dateStr: string): UpcomingDeadline["urgency"] {
    if (dateStr < today) return "overdue";
    if (dateStr === today) return "today";
    if (dateStr <= in7Days) return "this_week";
    return "upcoming";
  }

  for (const course of trainingDueSoonResult.data ?? []) {
    deadlines.push({
      id: course.id,
      type: "training",
      title: course.title,
      subtitle: "Training deadline",
      due_date: course.due_date,
      urgency: urgency(course.due_date),
    });
  }

  for (const cycle of reviewCyclesResult.data ?? []) {
    deadlines.push({
      id: cycle.id,
      type: "review_cycle",
      title: cycle.name,
      subtitle: "Review cycle ends",
      due_date: cycle.end_date,
      urgency: urgency(cycle.end_date),
    });
  }

  deadlines.sort((a, b) => {
    const order = { overdue: 0, today: 1, this_week: 2, upcoming: 3 };
    if (order[a.urgency] !== order[b.urgency]) return order[a.urgency] - order[b.urgency];
    return a.due_date.localeCompare(b.due_date);
  });

  // Active review cycles with completion stats
  const activeReviewCycles: ActiveReviewCycle[] = [];
  for (const cycle of reviewCyclesResult.data ?? []) {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("status")
      .eq("cycle_id", cycle.id)
      .eq("org_id", orgId);
    const total = reviews?.length ?? 0;
    const completed = reviews?.filter((r: any) => r.status === "completed").length ?? 0;
    activeReviewCycles.push({
      id: cycle.id,
      name: cycle.name,
      completed,
      total,
      end_date: cycle.end_date,
    });
  }

  return {
    stats: {
      totalEmployees: totalEmployees ?? 0,
      pendingLeaves: pendingLeaves ?? 0,
      trainingCompletion: trainingPct,
      complianceAlerts: overdueEnrollments ?? 0,
    },
    recentLeaves,
    upcomingDeadlines: deadlines.slice(0, 6),
    activeReviewCycles,
    // New fields
    userRole: role,
    userFirstName,
    whoIsOut,
    latestAnnouncements,
    pendingObjectivesCount: objectivePendingResult.count ?? 0,
    myLeaveBalances,
    myPendingLeavesCount,
    myOverdueTrainingCount,
    grievancesCount: isAdmin(role) ? (grievancesResult.count ?? 0) : 0,
  };
}
