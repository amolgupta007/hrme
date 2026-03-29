import type { Database } from "./database.types";

// ---- Row type shortcuts ----
export type Organization =
  Database["public"]["Tables"]["organizations"]["Row"];
export type Employee = Database["public"]["Tables"]["employees"]["Row"];
export type Department = Database["public"]["Tables"]["departments"]["Row"];
export type LeavePolicy =
  Database["public"]["Tables"]["leave_policies"]["Row"];
export type LeaveRequest =
  Database["public"]["Tables"]["leave_requests"]["Row"];
export type LeaveBalance =
  Database["public"]["Tables"]["leave_balances"]["Row"];
export type Document = Database["public"]["Tables"]["documents"]["Row"];
export type ReviewCycle =
  Database["public"]["Tables"]["review_cycles"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
export type TrainingCourse =
  Database["public"]["Tables"]["training_courses"]["Row"];
export type TrainingEnrollment =
  Database["public"]["Tables"]["training_enrollments"]["Row"];

// ---- Roles ----
export type UserRole = "owner" | "admin" | "manager" | "employee";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  employee: 1,
};

export function hasPermission(
  userRole: UserRole,
  requiredRole: UserRole
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ---- Navigation ----
export interface NavItem {
  title: string;
  href: string;
  icon: string;
  requiredRole?: UserRole;
  requiredPlan?: "growth" | "business";
  badge?: string;
}

// ---- API Response ----
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
