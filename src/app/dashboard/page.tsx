import { Users, CalendarDays, GraduationCap, AlertCircle } from "lucide-react";
import { getDashboardStats } from "@/actions/dashboard";

const quickActions = [
  { label: "Add Employee", href: "/dashboard/employees?action=new" },
  { label: "Review Leaves", href: "/dashboard/leaves" },
  { label: "Start Review Cycle", href: "/dashboard/reviews?action=new" },
  { label: "Upload Document", href: "/dashboard/documents?action=upload" },
];

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const statCards = [
    {
      label: "Total Employees",
      value: stats ? String(stats.totalEmployees) : "—",
      change: stats ? "Active team members" : "Could not load",
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Pending Leave Requests",
      value: stats ? String(stats.pendingLeaves) : "—",
      change: stats
        ? stats.pendingLeaves === 1
          ? "1 request awaiting review"
          : `${stats.pendingLeaves} requests awaiting review`
        : "Could not load",
      icon: CalendarDays,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      label: "Training Completion",
      value: stats ? `${stats.trainingCompletion}%` : "—",
      change: stats ? "Across all courses" : "Could not load",
      icon: GraduationCap,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Compliance Alerts",
      value: stats ? String(stats.complianceAlerts) : "—",
      change: stats
        ? stats.complianceAlerts === 0
          ? "All up to date"
          : "Overdue training items"
        : "Could not load",
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <div className={`rounded-lg ${stat.bg} p-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.change}</p>
          </div>
        ))}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="inline-flex items-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-all hover:border-primary/30 hover:shadow-sm"
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
