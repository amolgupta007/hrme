import {
  Users,
  CalendarDays,
  GraduationCap,
  AlertCircle,
} from "lucide-react";

const stats = [
  {
    label: "Total Employees",
    value: "—",
    change: "Connect Supabase to see data",
    icon: Users,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    label: "Pending Leave Requests",
    value: "—",
    change: "Awaiting your review",
    icon: CalendarDays,
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    label: "Training Completion",
    value: "—",
    change: "Across all courses",
    icon: GraduationCap,
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    label: "Compliance Alerts",
    value: "—",
    change: "Items need attention",
    icon: AlertCircle,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
];

const quickActions = [
  { label: "Add Employee", href: "/dashboard/employees?action=new" },
  { label: "Review Leaves", href: "/dashboard/leaves" },
  { label: "Start Review Cycle", href: "/dashboard/reviews?action=new" },
  { label: "Upload Document", href: "/dashboard/documents?action=upload" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back. Here&apos;s what&apos;s happening with your team.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-5 transition-all hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              <div className={`rounded-lg ${stat.bg} p-2`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
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

      {/* Setup Checklist — shown before Supabase is connected */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Setup Checklist</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Complete these steps to get your HR portal running.
        </p>
        <div className="space-y-3">
          {[
            {
              step: "Create a Supabase project and add credentials to .env.local",
              done: false,
            },
            {
              step: "Create a Clerk application and configure auth",
              done: false,
            },
            {
              step: "Run the database migration (npm run db:push)",
              done: false,
            },
            {
              step: "Set up Stripe products and pricing",
              done: false,
            },
            {
              step: "Deploy to Vercel and connect your domain",
              done: false,
            },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`h-5 w-5 shrink-0 rounded-full border-2 ${
                  item.done
                    ? "border-success bg-success"
                    : "border-muted-foreground/30"
                }`}
              />
              <span
                className={`text-sm ${
                  item.done
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
                }`}
              >
                {item.step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
