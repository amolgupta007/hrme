import type { OrgPlan } from "@/config/plans";
import type { UserRole } from "@/types";

export type RouteEntry = {
  path: string;
  params?: Record<string, string>;
  required_role: UserRole;
  required_plan: OrgPlan;
  required_org_feature?: "jambaHireEnabled" | "attendanceEnabled" | "grievancesEnabled";
  label: string;
  description: string;
  highlight_selector?: string;
};

export const ROUTE_REGISTRY = {} as const satisfies Record<string, RouteEntry>;

export type RouteKey = keyof typeof ROUTE_REGISTRY;

export function getRoute(key: string): RouteEntry | null {
  return (ROUTE_REGISTRY as Record<string, RouteEntry>)[key] ?? null;
}
