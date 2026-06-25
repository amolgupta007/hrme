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

// ---- Feedback ----
export type FeedbackType = "bug" | "feature_request" | "feedback" | "other";
export type FeedbackStatus = "new" | "triaged" | "in_progress" | "resolved" | "wontfix";
export type FeedbackSeverity = "low" | "medium" | "high" | "critical";
export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackReport {
  id: string;
  org_id: string;
  reporter_user_id: string;
  reporter_employee_id: string | null;
  reporter_role: UserRole;
  type: FeedbackType;
  title: string;
  description: string;
  severity: FeedbackSeverity | null;
  screenshot_url: string | null;
  page_url: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  priority: FeedbackPriority | null;
  admin_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackReportWithContext extends FeedbackReport {
  org_slug: string | null;
  org_name: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
}

// ─── JambaGeo domain types ────────────────────────────────────────────────────

export type { LeadStage, LeadOutcome } from "@/lib/geo/stages";
export { LEAD_STAGES, LEAD_OUTCOMES } from "@/lib/geo/stages";

export interface Geofence {
  id: string;
  orgId: string;
  name: string;
  type: "client" | "office";
  centerLat: number;
  centerLng: number;
  radiusM: number;
  isActive: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  orgId: string;
  name: string;
  contactPhone: string | null;
  contactEmail: string | null;
  company: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  assignedTo: string | null;
  assigneeName?: string | null; // hydrated by listLeads
  stage: LeadStage;
  valueInr: number | null;
  source: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadVisit {
  id: string;
  leadId: string;
  orgId: string;
  employeeId: string;
  employeeName?: string | null; // hydrated
  sessionId: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  outcome: LeadOutcome;
  followUpDate: string | null;
  photoUrl: string | null;
  source: "web" | "mobile";
  system: boolean;
  visitedAt: string;
  createdAt: string;
}

export interface ActiveSession {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  startedAt: string;
  lastPingAt: string | null;
  lastLat: number | null;
  lastLng: number | null;
}
