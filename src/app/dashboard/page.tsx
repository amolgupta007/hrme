import Link from "next/link";
import {
  Users, CalendarDays, GraduationCap, AlertCircle,
  Clock, ChevronRight, Target,
  ClipboardList, UserCheck, Megaphone, Pin,
  TrendingUp, BookOpen, FileText, UserPlus,
  CheckSquare, Network,
} from "lucide-react";
import { getDashboardData } from "@/actions/dashboard";
import { getMyOnboardingStatus } from "@/actions/onboarding";
import { cn, formatDate, getInitials } from "@/lib/utils";
import type { UserRole } from "@/types";
import type { DashboardData } from "@/actions/dashboard";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import type { OnboardingStatusResult } from "@/config/onboarding";

// ---- Style maps ----

const LEAVE_STATUS_STYLES = {
  pending:   "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  rejected:  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const URGENCY_STYLES = {
  overdue:   "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  today:     "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  this_week: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  upcoming:  "bg-muted text-muted-foreground",
};

const URGENCY_LABELS = {
  overdue:   "Overdue",
  today:     "Due Today",
  this_week: "This Week",
  upcoming:  "Upcoming",
};

const ANNOUNCEMENT_STYLES: Record<string, string> = {
  urgent: "border-l-destructive bg-destructive/5 text-destructive",
  policy: "border-l-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/10 dark:text-amber-300",
  event:  "border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/10 dark:text-blue-300",
  general:"border-l-border bg-muted/40 text-foreground",
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  paid:    "Paid",
  sick:    "Sick",
  casual:  "Casual",
  unpaid:  "Unpaid",
  earned:  "Earned",
  maternity: "Maternity",
  paternity: "Paternity",
};

// ---- Greeting helpers ----

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const salutation =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return name ? `${salutation}, ${name}` : salutation;
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ---- Role-aware stat cards ----

function buildStatCards(data: DashboardData) {
  const { stats, userRole, myLeaveBalances, myPendingLeavesCount, myOverdueTrainingCount, pendingObjectivesCount, grievancesCount } = data;

  const totalRemaining = myLeaveBalances.reduce((s, b) => s + b.remaining, 0);

  if (userRole === "employee") {
    return [
      {
        label: "My Leave Balance",
        value: `${totalRemaining}d`,
        sub: "Days remaining this year",
        icon: CalendarDays,
        color: "text-accent",
        bg: "bg-accent/10",
        href: "/dashboard/leaves",
      },
      {
        label: "My Pending Requests",
        value: String(myPendingLeavesCount),
        sub: myPendingLeavesCount === 0 ? "Nothing pending" : "Awaiting approval",
        icon: Clock,
        color: "text-primary",
        bg: "bg-primary/10",
        href: "/dashboard/leaves",
      },
      {
        label: "My Training",
        value: `${stats.trainingCompletion}%`,
        sub: "Completion rate",
        icon: GraduationCap,
        color: "text-green-600",
        bg: "bg-green-500/10",
        href: "/dashboard/training",
      },
      {
        label: "Overdue Training",
        value: String(myOverdueTrainingCount),
        sub: myOverdueTrainingCount === 0 ? "All up to date" : "Needs attention",
        icon: AlertCircle,
        color: myOverdueTrainingCount > 0 ? "text-destructive" : "text-muted-foreground",
        bg: myOverdueTrainingCount > 0 ? "bg-destructive/10" : "bg-muted",
        href: "/dashboard/training",
      },
    ];
  }

  if (userRole === "manager") {
    return [
      {
        label: "Total Employees",
        value: String(stats.totalEmployees),
        sub: "Active team members",
        icon: Users,
        color: "text-primary",
        bg: "bg-primary/10",
        href: "/dashboard/employees",
      },
      {
        label: "Pending Leaves",
        value: String(stats.pendingLeaves),
        sub: stats.pendingLeaves === 0 ? "All clear" : "Awaiting your approval",
        icon: CalendarDays,
        color: "text-accent",
        bg: "bg-accent/10",
        href: "/dashboard/leaves",
      },
      {
        label: "Training Completion",
        value: `${stats.trainingCompletion}%`,
        sub: "Across all courses",
        icon: GraduationCap,
        color: "text-green-600",
        bg: "bg-green-500/10",
        href: "/dashboard/training",
      },
      {
        label: "Objectives Pending",
        value: String(pendingObjectivesCount),
        sub: pendingObjectivesCount === 0 ? "Nothing to approve" : "Awaiting your review",
        icon: Target,
        color: pendingObjectivesCount > 0 ? "text-amber-600" : "text-muted-foreground",
        bg: pendingObjectivesCount > 0 ? "bg-amber-500/10" : "bg-muted",
        href: "/dashboard/objectives",
      },
    ];
  }

  // Admin / Owner
  return [
    {
      label: "Total Employees",
      value: String(stats.totalEmployees),
      sub: "Active team members",
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
      href: "/dashboard/employees",
    },
    {
      label: "Pending Leaves",
      value: String(stats.pendingLeaves),
      sub: stats.pendingLeaves === 0 ? "All clear" : "Awaiting approval",
      icon: CalendarDays,
      color: "text-accent",
      bg: "bg-accent/10",
      href: "/dashboard/leaves",
    },
    {
      label: "Training Completion",
      value: `${stats.trainingCompletion}%`,
      sub: "Across all courses",
      icon: GraduationCap,
      color: "text-green-600",
      bg: "bg-green-500/10",
      href: "/dashboard/training",
    },
    grievancesCount > 0
      ? {
          label: "Open Grievances",
          value: String(grievancesCount),
          sub: "Require attention",
          icon: AlertCircle,
          color: "text-destructive",
          bg: "bg-destructive/10",
          href: "/dashboard/grievances",
        }
      : {
          label: "Compliance Alerts",
          value: String(stats.complianceAlerts),
          sub: stats.complianceAlerts === 0 ? "All up to date" : "Overdue training",
          icon: AlertCircle,
          color: stats.complianceAlerts > 0 ? "text-destructive" : "text-muted-foreground",
          bg: stats.complianceAlerts > 0 ? "bg-destructive/10" : "bg-muted",
          href: "/dashboard/training",
        },
  ];
}

// ---- Role-aware quick actions ----

function getQuickActions(role: UserRole) {
  if (role === "employee") {
    return [
      { label: "Apply for Leave",     href: "/dashboard/leaves",      icon: CalendarDays },
      { label: "View My Documents",   href: "/dashboard/documents",   icon: FileText },
      { label: "Submit Objectives",   href: "/dashboard/objectives",  icon: Target },
      { label: "View Directory",      href: "/dashboard/directory",   icon: Network },
    ];
  }
  if (role === "manager") {
    return [
      { label: "Approve Leaves",      href: "/dashboard/leaves",      icon: CheckSquare },
      { label: "Submit Review",       href: "/dashboard/reviews",     icon: ClipboardList },
      { label: "Assign Training",     href: "/dashboard/training",    icon: BookOpen },
      { label: "View Directory",      href: "/dashboard/directory",   icon: Network },
    ];
  }
  // Admin / Owner
  return [
    { label: "Add Employee",          href: "/dashboard/employees",   icon: UserPlus },
    { label: "Post Announcement",     href: "/dashboard/announcements", icon: Megaphone },
    { label: "Review Leaves",         href: "/dashboard/leaves",      icon: CalendarDays },
    { label: "Upload Document",       href: "/dashboard/documents",   icon: FileText },
  ];
}

// ---- Page ----

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        Unable to load dashboard. Please refresh.
      </div>
    );
  }

  const { userRole, userFirstName, whoIsOut, latestAnnouncements, activeReviewCycles, myLeaveBalances } = data;
  const statCards = buildStatCards(data);
  const quickActions = getQuickActions(userRole);
  const showLeaveBalance = (userRole === "employee" || userRole === "manager") && myLeaveBalances.length > 0;

  // Fetch onboarding status for employee role only
  let onboardingStatus: OnboardingStatusResult | null = null;
  if (userRole === "employee") {
    const onboardingResult = await getMyOnboardingStatus();
    if (onboardingResult.success) onboardingStatus = onboardingResult.data;
  }

  return (
    <div className="space-y-6">

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{getGreeting(userFirstName)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{getTodayLabel()}</p>
      </div>

      {/* Announcement banners */}
      {latestAnnouncements.length > 0 && (
        <div className="space-y-2">
          {latestAnnouncements.map((a) => (
            <Link
              key={a.id}
              href="/dashboard/announcements"
              className={cn(
                "flex items-start gap-3 rounded-lg border border-l-4 px-4 py-3 text-sm transition-opacity hover:opacity-80",
                ANNOUNCEMENT_STYLES[a.category] ?? ANNOUNCEMENT_STYLES.general
              )}
            >
              {a.is_pinned
                ? <Pin className="h-4 w-4 shrink-0 mt-0.5" />
                : <Megaphone className="h-4 w-4 shrink-0 mt-0.5" />
              }
              <span className="font-medium">{a.title}</span>
              <ChevronRight className="h-4 w-4 shrink-0 ml-auto mt-0.5 opacity-60" />
            </Link>
          ))}
        </div>
      )}

      {/* Onboarding card — employee only, shown until all required steps done */}
      {onboardingStatus && !onboardingStatus.allRequiredComplete && (
        <OnboardingCard status={onboardingStatus} />
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-sm hover:border-primary/30"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className={cn("rounded-lg p-2", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
          </Link>
        ))}
      </div>

      {/* Main 2-col grid */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Leave requests feed */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">
              {userRole === "employee" ? "My Leave Requests" : "Recent Leave Requests"}
            </p>
            <Link href="/dashboard/leaves" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {!data.recentLeaves.length ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No leave requests yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentLeaves.map((leave) => (
                <div key={leave.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    {userRole !== "employee" && (
                      <p className="text-sm font-medium truncate">{leave.employee_name}</p>
                    )}
                    <p className={cn("text-xs text-muted-foreground capitalize", userRole === "employee" && "text-sm font-medium text-foreground")}>
                      {LEAVE_TYPE_LABELS[leave.leave_type] ?? leave.leave_type.replace("_", " ")}
                      {" · "}{leave.days} day{leave.days !== 1 ? "s" : ""}
                      {" · "}{formatDate(leave.start_date)}
                    </p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0", LEAVE_STATUS_STYLES[leave.status])}>
                    {leave.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Who's Out Today */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Who&apos;s Out Today</p>
            <Link href="/dashboard/leaves" className="flex items-center gap-1 text-xs text-primary hover:underline">
              All leaves <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {whoIsOut.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <UserCheck className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Everyone&apos;s in today</p>
              <p className="text-xs text-muted-foreground mt-0.5">No approved leaves for today</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {whoIsOut.map((person) => (
                <div key={person.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {getInitials(person.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{person.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {LEAVE_TYPE_LABELS[person.leave_type] ?? person.leave_type.replace("_", " ")} · back {formatDate(person.until)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Deadlines */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Upcoming Deadlines</p>
          </div>
          {!data.upcomingDeadlines.length ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No upcoming deadlines.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.upcomingDeadlines.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={cn("rounded-md p-1.5 shrink-0",
                    d.urgency === "overdue" ? "bg-red-100 dark:bg-red-900/20" :
                    d.urgency === "today"   ? "bg-amber-100 dark:bg-amber-900/20" :
                    "bg-muted"
                  )}>
                    {d.type === "training" ? (
                      <GraduationCap className={cn("h-3.5 w-3.5",
                        d.urgency === "overdue" ? "text-red-600" :
                        d.urgency === "today"   ? "text-amber-600" : "text-muted-foreground"
                      )} />
                    ) : d.type === "review_cycle" ? (
                      <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Target className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.subtitle} · {formatDate(d.due_date)}</p>
                  </div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium shrink-0", URGENCY_STYLES[d.urgency])}>
                    {URGENCY_LABELS[d.urgency]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Quick Actions</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-2.5 px-4 py-3.5 text-sm font-medium hover:bg-muted/40 transition-colors group"
              >
                <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                <span className="truncate">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Active Review Cycles */}
      {activeReviewCycles.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Active Review Cycles</p>
            <Link href="/dashboard/reviews" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {activeReviewCycles.map((cycle) => {
              const pct = cycle.total > 0 ? Math.round((cycle.completed / cycle.total) * 100) : 0;
              return (
                <div key={cycle.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{cycle.name}</p>
                    <span className="text-xs text-muted-foreground">ends {formatDate(cycle.end_date)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {cycle.completed}/{cycle.total} completed
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Leave Balance Strip (employee / manager) */}
      {showLeaveBalance && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">My Leave Balance</p>
            <Link href="/dashboard/leaves" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View details <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex flex-wrap gap-3 px-4 py-3">
            {myLeaveBalances.map((b) => (
              <div
                key={b.leave_type}
                className="flex flex-col items-center rounded-lg border border-border bg-muted/30 px-4 py-2.5 min-w-[90px]"
              >
                <span className="text-xs text-muted-foreground capitalize mb-1">
                  {LEAVE_TYPE_LABELS[b.leave_type] ?? b.leave_type}
                </span>
                <span className="text-xl font-bold tracking-tight text-foreground">{b.remaining}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">of {b.total_days} days</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
