"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";

async function getClerkOrgId(): Promise<string | null> {
  const { orgId, userId } = auth();
  if (orgId) return orgId;
  if (!userId) return null;
  const client = await clerkClient();
  const memberships = await client.users.getOrganizationMembershipList({ userId });
  return memberships.data[0]?.organization.id ?? null;
}

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

export type DashboardData = {
  stats: DashboardStats;
  recentLeaves: RecentLeave[];
  upcomingDeadlines: UpcomingDeadline[];
  activeReviewCycles: ActiveReviewCycle[];
};

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

  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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
  ] = await Promise.all([
    // Stats
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

    // Recent leave requests (last 6)
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, days, status, created_at, employees!employee_id(first_name, last_name)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(6),

    // Training courses with due dates in next 30 days that have incomplete enrollments
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

    // Pending objective approvals count
    supabase
      .from("objectives")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "submitted"),
  ]);

  const trainingPct =
    (totalEnrollments ?? 0) > 0
      ? Math.round(((completedEnrollments ?? 0) / (totalEnrollments ?? 1)) * 100)
      : 0;

  // Map recent leaves
  const recentLeaves: RecentLeave[] = (leavesResult.data ?? []).map((r: any) => ({
    id: r.id,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    leave_type: r.leave_type,
    start_date: r.start_date,
    end_date: r.end_date,
    days: r.days,
    status: r.status,
    created_at: r.created_at,
  }));

  // Build upcoming deadlines
  const deadlines: UpcomingDeadline[] = [];
  const today = now.toISOString().split("T")[0];
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

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

  // Sort deadlines: overdue first, then by date
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
  };
}
