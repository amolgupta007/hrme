"use client";

import * as React from "react";
import { Mail, Briefcase, Users, ChevronDown, ChevronRight } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { DirectoryEmployee } from "@/actions/directory";

interface OrgTreeProps {
  employees: DirectoryEmployee[];
  search: string;
}

type TreeNode = DirectoryEmployee & { children: TreeNode[] };

function buildTree(employees: DirectoryEmployee[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const e of employees) map.set(e.id, { ...e, children: [] });

  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (!node.reporting_manager_id || !map.has(node.reporting_manager_id)) {
      roots.push(node);
    } else {
      map.get(node.reporting_manager_id)!.children.push(node);
    }
  }
  return roots;
}

function matchesSearch(node: TreeNode, q: string): boolean {
  const str = `${node.first_name} ${node.last_name} ${node.email} ${node.designation ?? ""} ${node.department_name ?? ""}`.toLowerCase();
  return str.includes(q);
}

function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  return nodes.reduce<TreeNode[]>((acc, node) => {
    const filteredChildren = filterTree(node.children, q);
    if (matchesSearch(node, q) || filteredChildren.length > 0) {
      acc.push({ ...node, children: filteredChildren });
    }
    return acc;
  }, []);
}

export function OrgTree({ employees, search }: OrgTreeProps) {
  const roots = buildTree(employees);
  const filtered = filterTree(roots, search.toLowerCase());

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
        <Users className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">No employees match your search.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.map((node) => (
        <TreeNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}

function TreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const hasChildren = node.children.length > 0;

  return (
    <div className={cn("relative", depth > 0 && "ml-8 pl-6 border-l-2 border-border")}>
      <EmployeeNodeCard
        node={node}
        collapsed={collapsed}
        onToggle={hasChildren ? () => setCollapsed((c) => !c) : undefined}
      />
      {hasChildren && !collapsed && (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeNodeCard({
  node,
  collapsed,
  onToggle,
}: {
  node: TreeNode;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const fullName = `${node.first_name} ${node.last_name}`;
  const roleColors: Record<string, string> = {
    owner:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    admin:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    manager:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    employee: "bg-muted text-muted-foreground",
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
        {getInitials(fullName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-sm">{fullName}</p>
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize", roleColors[node.role] ?? roleColors.employee)}>
            {node.role}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {node.designation && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3" />
              {node.designation}
            </span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            {node.email}
          </span>
          {node.department_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {node.department_name}
            </span>
          )}
        </div>
      </div>
      {onToggle && (
        <button
          onClick={onToggle}
          className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-full px-2 py-0.5 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          {node.children.length} report{node.children.length !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
