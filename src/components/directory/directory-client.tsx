"use client";

import * as React from "react";
import { Search, LayoutGrid, GitBranch, Mail, Briefcase, UserCheck } from "lucide-react";
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

export function DirectoryClient({ employees }: DirectoryClientProps) {
  const [view, setView] = React.useState<View>("cards");
  const [search, setSearch] = React.useState("");

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.designation?.toLowerCase().includes(q) ||
      e.department_name?.toLowerCase().includes(q) ||
      e.manager_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
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
        <p className="text-sm text-muted-foreground shrink-0">
          {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
        </p>
      </div>

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

function EmployeeCard({ employee: e }: { employee: DirectoryEmployee }) {
  const fullName = `${e.first_name} ${e.last_name}`;
  return (
    <div className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition-shadow space-y-4">
      {/* Avatar + name */}
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
          {getInitials(fullName)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{fullName}</p>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize mt-1", ROLE_COLORS[e.role] ?? ROLE_COLORS.employee)}>
            {e.role}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2">
        {e.designation && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{e.designation}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{e.email}</span>
        </div>
        {e.department_name && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-3.5 w-3.5 shrink-0 text-center text-xs">🏢</span>
            <span className="truncate">{e.department_name}</span>
          </div>
        )}
      </div>

      {/* Manager */}
      {e.manager_name && (
        <div className="pt-3 border-t border-border flex items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Reports to</span>
          <span className="text-xs font-medium truncate">{e.manager_name}</span>
        </div>
      )}
    </div>
  );
}

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

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">No employees match your search.</p>
    </div>
  );
}
