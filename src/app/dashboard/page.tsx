import Link from "next/link";
import {
  Users, CalendarDays, GraduationCap, AlertCircle,
  Clock, CheckCircle2, XCircle, ChevronRight, Target,
  ClipboardList, AlertTriangle,
} from "lucide-react";
import { getDashboardData } from "@/actions/dashboard";
import { cn, formatDate } from "@/lib/utils";

const LEAVE_STATUS_STYLES = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

const URGENCY_STYLES = {
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  today: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  this_week: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  upcoming: "bg-muted text-muted-foreground",
};

const URGENCY_LABELS = {
  overdue: "Overdue",
  today: "Due Today",
  this_week: "This Week",
  upcoming: "Upcoming",
};

const quickActions = [
  { label: "Add Employee", href: "/dashboard/employees" },
  { label: "Review Leaves", href: "/dashboard/leaves" },
  { label: "Start Review Cycle", href: "/dashboard/reviews" },
  { label: "Upload Document", href: "/dashboard/documents" },
];

export default async function DashboardPage() {
  const data = await getDashboardData();
  const stats = data?.stats;

  const statCards = [
    {
      label: "Total Employees",
      value: stats ? String(stats.totalEmployees) : "—",
      sub: "Active team members",
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
      href: "/dashboard/employees",
    },
    {
      label: "Pending Leaves",
      value: stats ? String(stats.pendingLeaves) : "—",
      sub: stats?.pendingLeaves === 0 ? "All clear" : "Awaiting approval",
      icon: CalendarDays,
      color: "text-accent",
      bg: "bg-accent/10",
      href: "/dashboard/leaves",
    },
    {
      label: "Training Completion",
      value: stats ? `${stats.trainingCompletion}%` : "—",
      sub: "Across all courses",
      icon: GraduationCap,
      color: "text-green-600",
      bg: "bg-green-500/10",
      href: "/dashboard/training",
    },
    {
      label: "Compliance Alerts",
      value: stats ? String(stats.complianceAlerts) : "—",
      sub: stats?.complianceAlerts === 0 ? "All up to date" : "Overdue training items",
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      href: "/dashboard/training",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your team.
        </p>
      </div>

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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent leave requests */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Recent Leave Requests</p>
            <Link href="/dashboard/leaves" className="flex items-center gap-1 text-xs text-primary hover:underline">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          {!data?.recentLeaves.length ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No leave requests yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentLeaves.map((leave) => (
                <div key={leave.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{leave.employee_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {leave.leave_type.replace("_", " ")} · {leave.days} day{leave.days !== 1 ? "s" : ""}
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

        {/* Upcoming deadlines */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Upcoming Deadlines</p>
          </div>
          {!data?.upcomingDeadlines.length ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No upcoming deadlines.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.upcomingDeadlines.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={cn("rounded-md p-1.5 shrink-0",
                    d.urgency === "overdue" ? "bg-red-100 dark:bg-red-900/20" :
                    d.urgency === "today" ? "bg-amber-100 dark:bg-amber-900/20" :
                    "bg-muted"
                  )}>
                    {d.type === "training" ? (
                      <GraduationCap className={cn("h-3.5 w-3.5",
                        d.urgency === "overdue" ? "text-red-600" :
                        d.urgency === "today" ? "text-amber-600" : "text-muted-foreground"
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

        {/* Active review cycles */}
        {data?.activeReviewCycles && data.activeReviewCycles.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Active Review Cycles</p>
              <Link href="/dashboard/reviews" className="flex items-center gap-1 text-xs text-primary hover:underline">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {data.activeReviewCycles.map((cycle) => {
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

        {/* Quick actions */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Quick Actions</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-border">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center justify-between px-4 py-3.5 text-sm font-medium hover:bg-muted/40 transition-colors"
              >
                {action.label}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
