"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import type { UserRole } from "@/types";

async function getClerkOrgId(): Promise<string | null> {
  // Returns the INTERNAL org id now (Clerk Organizations decoupled); name kept
  // to avoid churn at the single call site.
  const user = await getCurrentUser();
  return user?.orgId ?? null;
}

// ---- Types ----

export type DashboardStats = {
  totalEmployees: number;
  pendingLeaves: number;
  trainingCompletion: number;
  complianceAlerts: number;
  joinedThisMonth: number;
  pendingLeavesThisWeek: number;
};

export type PresentToday = {
  present: number;
  total: number;
};

export type LastPayrollRun = {
  month: string; // YYYY-MM
  status: string;
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

export type MyActiveObjectives = {
  id: string;
  period_label: string;
  period_type: string;
  total_items: number;
  achieved_items: number;
};

export type MyLatestReview = {
  id: string;
  cycle_name: string;
  status: "pending" | "self_review" | "manager_review" | "completed";
  self_rating: number | null;
  manager_rating: number | null;
  completed_at: string | null;
  rating_scale: 3 | 5 | 10;
};

export type UpcomingHoliday = {
  id: string;
  name: string;
  date: string;
  is_optional: boolean;
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
  whoIsOutTotal: number;
  latestAnnouncements: LatestAnnouncement[];
  pendingObjectivesCount: number;
  myLeaveBalances: MyLeaveBalance[];
  myPendingLeavesCount: number;
  myOverdueTrainingCount: number;
  myTrainingCompletion: number;
  grievancesCount: number;
  myActiveObjectives: MyActiveObjectives | null;
  myLatestReview: MyLatestReview | null;
  upcomingHolidays: UpcomingHoliday[];
  presentToday: PresentToday | null;
  lastPayrollRun: LastPayrollRun | null;
  showInsightsCard: boolean;
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
    .eq("id", clerkOrgId)
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
  const monthStart = `${today.slice(0, 7)}-01`;
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // attendance_records.date is written as the IST calendar date (see attendance.ts)
  const istToday = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // ---- Parallel queries ----
  const [
    { count: totalEmployees },
    { count: pendingLeaves },
    { count: totalEnrollments },
    { count: completedEnrollments },
    { count: overdueEnrollments },
    { count: joinedThisMonth },
    { count: pendingLeavesThisWeek },
    pendingLeavesListResult,
    recentLeavesListResult,
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
    supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "active")
      .gte("date_of_joining", monthStart),
    supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending")
      .gte("created_at", sevenDaysAgoIso),

    // Pending leave requests fetched separately so they can never be pushed
    // out of the feed window by a burst of newer approved/rejected rows.
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, days, status, created_at, employees!employee_id(first_name, last_name)")
      .eq("org_id", orgId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(6),

    // Latest non-pending requests backfill the remaining slots
    supabase
      .from("leave_requests")
      .select("id, leave_type, start_date, end_date, days, status, created_at, employees!employee_id(first_name, last_name)")
      .eq("org_id", orgId)
      .neq("status", "pending")
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

    // Who's out today (count: "exact" so the UI can show a "+N more" tail)
    supabase
      .from("leave_requests")
      .select("id, leave_type, end_date, employees!employee_id(first_name, last_name, avatar_url)", { count: "exact" })
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
  let myTrainingCompletion = 0;
  let userFirstName = "";
  let myActiveObjectives: MyActiveObjectives | null = null;
  let myLatestReview: MyLatestReview | null = null;

  if (employeeId) {
    const [
      empResult,
      leaveBalancesResult,
      myPendingResult,
      myOverdueResult,
      myObjectivesResult,
      myReviewResult,
      myEnrollmentsResult,
      myCompletedEnrollmentsResult,
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
      supabase
        .from("objectives")
        .select("id, period_label, period_type, items")
        .eq("org_id", orgId)
        .eq("employee_id", employeeId)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("reviews")
        .select("id, status, self_rating, manager_rating, completed_at, review_cycles(name, rating_scale)")
        .eq("org_id", orgId)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("training_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("employee_id", employeeId),
      supabase
        .from("training_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("employee_id", employeeId)
        .eq("status", "completed"),
    ]);

    userFirstName = (empResult.data as any)?.first_name ?? "";
    myPendingLeavesCount = myPendingResult.count ?? 0;
    myOverdueTrainingCount = myOverdueResult.count ?? 0;
    const myTotal = myEnrollmentsResult.count ?? 0;
    myTrainingCompletion =
      myTotal > 0 ? Math.round(((myCompletedEnrollmentsResult.count ?? 0) / myTotal) * 100) : 0;

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

    const objRow = myObjectivesResult.data as any;
    if (objRow) {
      const items = Array.isArray(objRow.items) ? objRow.items : [];
      myActiveObjectives = {
        id: objRow.id,
        period_label: objRow.period_label,
        period_type: objRow.period_type,
        total_items: items.length,
        achieved_items: items.filter((i: any) => i.self_status === "achieved").length,
      };
    }

    const revRow = myReviewResult.data as any;
    if (revRow) {
      myLatestReview = {
        id: revRow.id,
        cycle_name: revRow.review_cycles?.name ?? "Review",
        status: revRow.status,
        self_rating: revRow.self_rating,
        manager_rating: revRow.manager_rating,
        completed_at: revRow.completed_at,
        rating_scale: (revRow.review_cycles?.rating_scale as 3 | 5 | 10) ?? 5,
      };
    }
  }

  // Upcoming holidays (next 3) — relevant for everyone but cheap to always fetch
  const today_ymd = today;
  const { data: holidaysData } = await supabase
    .from("holidays")
    .select("id, name, date, is_optional")
    .eq("org_id", orgId)
    .gte("date", today_ymd)
    .order("date", { ascending: true })
    .limit(3);
  const upcomingHolidays: UpcomingHoliday[] = (holidaysData ?? []).map((h: any) => ({
    id: h.id,
    name: h.name,
    date: h.date,
    is_optional: !!h.is_optional,
  }));

  const trainingPct =
    (totalEnrollments ?? 0) > 0
      ? Math.round(((completedEnrollments ?? 0) / (totalEnrollments ?? 1)) * 100)
      : 0;

  // ---- Module-aware admin cards (only queried when relevant) ----
  let presentToday: PresentToday | null = null;
  let lastPayrollRun: LastPayrollRun | null = null;
  if (isAdmin(role)) {
    const [attendanceResult, payrollResult] = await Promise.all([
      user?.attendanceEnabled
        ? supabase
            .from("attendance_records")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("date", istToday)
            .not("clock_in_at", "is", null)
        : Promise.resolve(null),
      hasFeature(user?.plan ?? "starter", "payroll", user?.customFeatures ?? null)
        ? supabase
            .from("payroll_runs")
            .select("month, status")
            .eq("org_id", orgId)
            .order("month", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve(null),
    ]);
    if (attendanceResult) {
      presentToday = {
        present: attendanceResult.count ?? 0,
        total: totalEmployees ?? 0,
      };
    }
    const runRow = payrollResult?.data as { month: string; status: string } | null | undefined;
    if (runRow) {
      lastPayrollRun = { month: runRow.month, status: runRow.status };
    }
  }

  // Pending requests always lead the feed; latest decided ones backfill.
  const mapLeave = (r: any): RecentLeave => ({
    id: r.id,
    employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.trim(),
    leave_type: r.leave_type,
    start_date: r.start_date,
    end_date: r.end_date,
    days: r.days,
    status: r.status,
    created_at: r.created_at,
  });
  const recentLeaves = [
    ...(pendingLeavesListResult.data ?? []).map(mapLeave),
    ...(recentLeavesListResult.data ?? []).map(mapLeave),
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

  // Active review cycles with completion stats — single query, grouped in JS
  const activeReviewCycles: ActiveReviewCycle[] = [];
  const cycleRows = reviewCyclesResult.data ?? [];
  if (cycleRows.length > 0) {
    const { data: cycleReviews } = await supabase
      .from("reviews")
      .select("status, cycle_id")
      .eq("org_id", orgId)
      .in("cycle_id", cycleRows.map((c: any) => c.id));
    const byCycle = new Map<string, { total: number; completed: number }>();
    for (const r of (cycleReviews ?? []) as any[]) {
      const agg = byCycle.get(r.cycle_id) ?? { total: 0, completed: 0 };
      agg.total += 1;
      if (r.status === "completed") agg.completed += 1;
      byCycle.set(r.cycle_id, agg);
    }
    for (const cycle of cycleRows) {
      const agg = byCycle.get(cycle.id) ?? { total: 0, completed: 0 };
      activeReviewCycles.push({
        id: cycle.id,
        name: cycle.name,
        completed: agg.completed,
        total: agg.total,
        end_date: cycle.end_date,
      });
    }
  }

  return {
    stats: {
      totalEmployees: totalEmployees ?? 0,
      pendingLeaves: pendingLeaves ?? 0,
      trainingCompletion: trainingPct,
      complianceAlerts: overdueEnrollments ?? 0,
      joinedThisMonth: joinedThisMonth ?? 0,
      pendingLeavesThisWeek: pendingLeavesThisWeek ?? 0,
    },
    recentLeaves,
    upcomingDeadlines: deadlines.slice(0, 6),
    activeReviewCycles,
    // New fields
    userRole: role,
    userFirstName,
    whoIsOut,
    whoIsOutTotal: whoIsOutResult.count ?? whoIsOut.length,
    latestAnnouncements,
    pendingObjectivesCount: objectivePendingResult.count ?? 0,
    myLeaveBalances,
    myPendingLeavesCount,
    myOverdueTrainingCount,
    myTrainingCompletion,
    grievancesCount: isAdmin(role) ? (grievancesResult.count ?? 0) : 0,
    myActiveObjectives,
    myLatestReview,
    upcomingHolidays,
    presentToday,
    lastPayrollRun,
    showInsightsCard:
      isAdmin(role) &&
      hasFeature(user?.plan ?? "starter", "analytics", user?.customFeatures ?? null),
  };
}
