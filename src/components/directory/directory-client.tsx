"use client";

import * as React from "react";
import { Search, LayoutGrid, GitBranch, Briefcase, Building2, UserCheck } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { OrgTree } from "./org-tree";
import type { DirectoryEmployee } from "@/actions/directory";

interface DirectoryClientProps {
  employees: DirectoryEmployee[];
}

type View = "cards" | "hierarchy";

const ROLE_COLORS: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  manager:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  employee: "bg-muted text-muted-foreground",
};

// Deterministic color ring per department name
const DEPT_RING_COLORS = [
  "ring-teal-400",
  "ring-blue-400",
  "ring-violet-400",
  "ring-amber-400",
  "ring-rose-400",
  "ring-emerald-400",
];

function deptRingColor(name: string | null): string {
  if (!name) return "ring-border";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return DEPT_RING_COLORS[h % DEPT_RING_COLORS.length];
}

const STATUS_DOT: Record<string, string> = {
  active:   "bg-emerald-400",
  on_leave: "bg-amber-400",
  inactive: "bg-gray-400",
};

export function DirectoryClient({ employees }: DirectoryClientProps) {
  const [view, setView] = React.useState<View>("cards");
  const [search, setSearch] = React.useState("");
  const [deptFilter, setDeptFilter] = React.useState<string | null>(null);

  // Unique sorted department names
  const departments = React.useMemo(() => {
    const names = [
      ...new Set(employees.map((e) => e.department_name).filter(Boolean) as string[]),
    ].sort();
    return names;
  }, [employees]);

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.designation?.toLowerCase().includes(q) ||
      e.department_name?.toLowerCase().includes(q) ||
      e.manager_name?.toLowerCase().includes(q);
    const matchesDept = !deptFilter || e.department_name === deptFilter;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="space-y-5">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Search by name, role, department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center rounded-lg border border-border bg-muted/40 p-1">
          <ViewButton active={view === "cards"} onClick={() => setView("cards")} title="Cards">
            <LayoutGrid className="h-4 w-4" />
          </ViewButton>
          <ViewButton active={view === "hierarchy"} onClick={() => setView("hierarchy")} title="Org Chart">
            <GitBranch className="h-4 w-4" />
          </ViewButton>
        </div>
        <p className="text-sm text-muted-foreground ml-auto shrink-0">
          {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
        </p>
      </div>

      {/* Department filter tabs (cards view only) */}
      {view === "cards" && departments.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <DeptTab active={deptFilter === null} onClick={() => setDeptFilter(null)}>
            All
          </DeptTab>
          {departments.map((dept) => (
            <DeptTab
              key={dept}
              active={deptFilter === dept}
              onClick={() => setDeptFilter(deptFilter === dept ? null : dept)}
            >
              {dept}
            </DeptTab>
          ))}
        </div>
      )}

      {/* Views */}
      {view === "cards" ? (
        filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((emp) => <EmployeeCard key={emp.id} employee={emp} />)}
          </div>
        )
      ) : (
        <OrgTree employees={employees} search={search} />
      )}
    </div>
  );
}

// ---- Employee card ----

function EmployeeCard({ employee: e }: { employee: DirectoryEmployee }) {
  const fullName = `${e.first_name} ${e.last_name}`;
  const displayStatus = e.is_on_leave && e.status === "active" ? "on_leave" : e.status;
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow space-y-3">
      {/* Avatar + name + role */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base ring-2",
            deptRingColor(e.department_name)
          )}>
            {getInitials(fullName)}
          </div>
          {/* Status dot */}
          <span className={cn(
            "absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-card",
            STATUS_DOT[displayStatus] ?? "bg-gray-400"
          )} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{fullName}</p>
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0",
              ROLE_COLORS[e.role] ?? ROLE_COLORS.employee
            )}>
              {e.role}
            </span>
          </div>
          {e.designation && (
            <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
              <Briefcase className="h-3 w-3 shrink-0" />
              {e.designation}
            </p>
          )}
        </div>
      </div>

      {/* Department */}
      {e.department_name && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{e.department_name}</span>
        </div>
      )}

      {/* Manager */}
      {e.manager_name && (
        <div className="pt-2.5 border-t border-border flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Reports to</span>
          <span className="text-xs font-medium truncate">{e.manager_name}</span>
        </div>
      )}
    </div>
  );
}

// ---- Department tab ----

function DeptTab({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ---- View toggle button ----

function ViewButton({ active, onClick, children, title }: {
  active: boolean; onClick: () => void; children: React.ReactNode; title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-2 transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ---- Empty state ----

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No employees match your search or filter.</p>
    </div>
  );
}
