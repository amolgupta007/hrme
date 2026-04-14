import { Briefcase, FileText, Users, Kanban, CalendarDays, FileSignature } from "lucide-react";

const MODULES = [
  {
    icon: FileText,
    label: "Jobs",
    desc: "Create and publish job openings. Manage active, paused, and closed roles.",
    href: "/hire/jobs",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  {
    icon: Users,
    label: "Candidates",
    desc: "All applicants in one place. Track source, stage, and communication history.",
    href: "/hire/candidates",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    icon: Kanban,
    label: "Pipeline",
    desc: "Kanban view across all active roles — drag candidates between stages.",
    href: "/hire/pipeline",
    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
  {
    icon: CalendarDays,
    label: "Interviews",
    desc: "Schedule and track interviews. Collect structured feedback from interviewers.",
    href: "/hire/interviews",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
  },
  {
    icon: FileSignature,
    label: "Offers",
    desc: "Generate, send, and track offer letters. Log acceptances and rejections.",
    href: "/hire/offers",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
];

export default function HirePage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
            <Briefcase className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-indigo-900 dark:text-indigo-100">
            Welcome to JambaHire
          </h1>
        </div>
        <p className="text-muted-foreground ml-[52px]">
          Your end-to-end hiring suite. Post jobs, track candidates, schedule interviews, and close offers — all in one place.
        </p>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod) => (
          <a
            key={mod.href}
            href={mod.href}
            className="group rounded-xl border border-indigo-100 bg-white p-5 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md dark:border-indigo-900/40 dark:bg-[#150e2b] dark:hover:border-indigo-700"
          >
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${mod.color}`}>
              <mod.icon className="h-5 w-5" />
            </div>
            <p className="font-semibold text-sm text-foreground group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
              {mod.label}
            </p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{mod.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
