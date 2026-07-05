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

export function isOwner(role: UserRole): boolean {
  return role === "owner";
}

// ---- Billing ----
export type BillingCycle = "monthly" | "annual";

export type SubscriptionStatus =
  | "active"
  | "paused"
  | "halted"
  | "pending"
  | "cancelled";

// ---- Navigation ----
export interface NavItem {
  title: string;
  href: string;
  icon: string;
  requiredRole?: UserRole;
  requiredPlan?: "growth" | "business";
  featureFlag?: string;
  badge?: string;
  hideForContractor?: boolean;
}

// ---- API Response ----
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
