"use client";

import * as React from "react";
import { Briefcase, Users, Minus, Plus } from "lucide-react";
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

function collectExpandableIds(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) =>
    n.children.length > 0 ? [n.id, ...collectExpandableIds(n.children)] : []
  );
}

export function OrgTree({ employees, search }: OrgTreeProps) {
  const roots = buildTree(employees);
  const filtered = filterTree(roots, search.toLowerCase());
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const expandableIds = React.useMemo(() => collectExpandableIds(roots), [roots]);

  function expandAll() { setCollapsed(new Set()); }
  function collapseAll() { setCollapsed(new Set(expandableIds)); }
  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

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
      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={expandAll}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Expand all
        </button>
        <span className="text-muted-foreground text-xs">·</span>
        <button
          onClick={collapseAll}
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
        >
          Collapse all
        </button>
      </div>

      {/* Tree */}
      <div>
        {filtered.map((node, i) => (
          <TreeNodeRow
            key={node.id}
            node={node}
            depth={0}
            isLast={i === filtered.length - 1}
            collapsed={collapsed}
            onToggle={toggle}
            searchQ={search.toLowerCase()}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  isLast: boolean;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  searchQ: string;
}

function TreeNodeRow({ node, depth, isLast, collapsed, onToggle, searchQ }: TreeNodeRowProps) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const isMatch = searchQ ? matchesSearch(node, searchQ) : false;
  const cappedDepth = Math.min(depth, 4);

  return (
    <div>
      <div className="flex">
        {/* Connector columns */}
        {depth > 0 && (
          <div className="shrink-0 flex" style={{ width: cappedDepth * 28 }}>
            {Array.from({ length: cappedDepth }).map((_, i) => (
              <div key={i} className="w-7 shrink-0 relative">
                {i === cappedDepth - 1 ? (
                  <>
                    {/* Vertical line — full height for non-last siblings, half for last */}
                    <div className={cn(
                      "absolute left-3 top-0 w-px bg-border",
                      isLast ? "h-5" : "h-full"
                    )} />
                    {/* Horizontal branch */}
                    <div className="absolute left-3 top-5 w-4 h-px bg-border" />
                  </>
                ) : (
                  /* Continuing vertical line for ancestor levels */
                  <div className="absolute left-3 inset-y-0 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Overflow indicator beyond depth 4 */}
        {depth > 4 && (
          <div className="w-4 shrink-0 flex items-center justify-center text-muted-foreground/40 text-[10px] select-none">
            ⋯
          </div>
        )}

        {/* Card */}
        <div className="flex-1 py-1">
          <EmployeeNodeCard
            node={node}
            depth={depth}
            isCollapsed={isCollapsed}
            isMatch={isMatch}
            searchActive={!!searchQ}
            onToggle={hasChildren ? () => onToggle(node.id) : undefined}
          />
        </div>
      </div>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children.length - 1}
              collapsed={collapsed}
              onToggle={onToggle}
              searchQ={searchQ}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  owner:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  admin:    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  manager:  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  employee: "bg-muted text-muted-foreground",
};

function EmployeeNodeCard({
  node, depth, isCollapsed, isMatch, searchActive, onToggle,
}: {
  node: TreeNode;
  depth: number;
  isCollapsed: boolean;
  isMatch: boolean;
  searchActive: boolean;
  onToggle?: () => void;
}) {
  const fullName = `${node.first_name} ${node.last_name}`;
  const isRoot = depth === 0;
  const dimmed = searchActive && !isMatch;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border bg-card p-3 transition-all hover:shadow-sm",
      isRoot ? "border-border/80 shadow-sm" : "border-border",
      isMatch && searchActive ? "ring-2 ring-primary ring-offset-1" : "",
      dimmed ? "opacity-40" : "",
    )}>
      {/* Avatar */}
      <div className={cn(
        "shrink-0 flex items-center justify-center rounded-full bg-primary/10 text-primary font-bold overflow-hidden",
        isRoot ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"
      )}>
        {node.avatar_url ? (
          <img src={node.avatar_url} alt={fullName} className={cn("object-cover rounded-full", isRoot ? "h-11 w-11" : "h-9 w-9")} />
        ) : (
          getInitials(fullName)
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("truncate", isRoot ? "font-bold text-sm" : "font-medium text-sm")}>
            {fullName}
          </p>
          <span className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0",
            ROLE_COLORS[node.role] ?? ROLE_COLORS.employee
          )}>
            {node.role}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {node.designation && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3 shrink-0" />
              {node.designation}
            </span>
          )}
          {node.department_name && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3 shrink-0" />
              {node.department_name}
            </span>
          )}
        </div>
      </div>

      {/* Expand / collapse */}
      {onToggle && (
        <button
          onClick={onToggle}
          title={isCollapsed
            ? `Expand (${node.children.length} report${node.children.length !== 1 ? "s" : ""})`
            : "Collapse"
          }
          className={cn(
            "shrink-0 flex h-7 w-7 items-center justify-center rounded-full border transition-colors",
            isCollapsed
              ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
              : "border-border bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {isCollapsed ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
