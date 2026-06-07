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

export const ROUTE_REGISTRY = {
  // Employees + directory
  add_employee: {
    path: "/dashboard/employees",
    label: "Add a new employee",
    description: "Create an employee record and optionally send them a Clerk invite.",
    required_role: "admin",
    required_plan: "starter",
  },
  bulk_import_employees: {
    path: "/dashboard/employees/import",
    label: "Bulk-import employees from CSV",
    description: "Upload a CSV of employees and invite them in one go.",
    required_role: "admin",
    required_plan: "starter",
  },
  view_org_directory: {
    path: "/dashboard/directory",
    label: "Browse the employee directory",
    description: "Search teammates by name, department, or role.",
    required_role: "employee",
    required_plan: "starter",
  },

  // Leave
  request_leave: {
    path: "/dashboard/leaves",
    params: { tab: "new" },
    label: "Apply for leave",
    description: "Submit a new leave request.",
    required_role: "employee",
    required_plan: "starter",
  },
  approve_leave: {
    path: "/dashboard/leaves",
    params: { tab: "pending" },
    label: "Approve or reject a leave request",
    description: "Action a pending team request.",
    required_role: "manager",
    required_plan: "starter",
  },
  view_leave_balance: {
    path: "/dashboard/leaves",
    params: { tab: "balance" },
    label: "View your leave balance",
    description: "See remaining paid/sick/casual days for the current year.",
    required_role: "employee",
    required_plan: "starter",
  },
  configure_leave_policy: {
    path: "/dashboard/settings",
    params: { section: "leave-policies" },
    label: "Configure leave policies",
    description: "Set per-type annual quotas, carry-forward rules, and accrual.",
    required_role: "admin",
    required_plan: "starter",
  },

  // Documents
  upload_document: {
    path: "/dashboard/documents",
    params: { tab: "upload" },
    label: "Upload a document",
    description: "Share a policy, contract, or HR document with the team.",
    required_role: "admin",
    required_plan: "growth",
  },
  acknowledge_document: {
    path: "/dashboard/documents",
    label: "Acknowledge a required document",
    description: "Sign off on a policy that needs your acknowledgment.",
    required_role: "employee",
    required_plan: "growth",
  },

  // Reviews
  start_review_cycle: {
    path: "/dashboard/reviews",
    params: { tab: "cycles" },
    label: "Start a review cycle",
    description: "Open a new performance review cycle for the org.",
    required_role: "admin",
    required_plan: "growth",
  },
  submit_self_review: {
    path: "/dashboard/reviews",
    label: "Submit your self-review",
    description: "Complete the self-assessment portion of an active review cycle.",
    required_role: "employee",
    required_plan: "growth",
  },
  submit_manager_review: {
    path: "/dashboard/reviews",
    label: "Submit a manager review",
    description: "Review a direct report for the active cycle.",
    required_role: "manager",
    required_plan: "growth",
  },

  // Objectives
  create_objective: {
    path: "/dashboard/objectives",
    params: { tab: "draft" },
    label: "Create an objective",
    description: "Draft a quarterly objective with sub-items.",
    required_role: "employee",
    required_plan: "growth",
  },
  approve_objective: {
    path: "/dashboard/objectives",
    params: { tab: "to-approve" },
    label: "Approve an objective",
    description: "Approve a direct report's draft objective.",
    required_role: "manager",
    required_plan: "growth",
  },

  // Training
  assign_training: {
    path: "/dashboard/training",
    params: { tab: "courses" },
    label: "Assign a training course",
    description: "Enrol employees into a course or compliance module.",
    required_role: "admin",
    required_plan: "growth",
  },
  view_my_training: {
    path: "/dashboard/training",
    label: "View your assigned trainings",
    description: "See pending and completed training enrolments.",
    required_role: "employee",
    required_plan: "growth",
  },

  // Payroll
  configure_salary_structure: {
    path: "/dashboard/payroll",
    params: { tab: "salary-structures" },
    label: "Configure an employee's salary",
    description: "Set CTC components for a team member.",
    required_role: "admin",
    required_plan: "business",
  },
  run_payroll: {
    path: "/dashboard/payroll",
    params: { tab: "runs" },
    label: "Run payroll for the month",
    description: "Process a monthly payroll run end-to-end.",
    required_role: "admin",
    required_plan: "business",
  },
  view_my_payslip: {
    path: "/dashboard/payroll",
    params: { tab: "my-payslips" },
    label: "Download your payslip",
    description: "View and print payslips for past months.",
    required_role: "employee",
    required_plan: "business",
  },

  // Attendance
  clock_in_out: {
    path: "/dashboard/attendance",
    label: "Clock in or out",
    description: "Mark presence for the day.",
    required_role: "employee",
    required_plan: "starter",
    required_org_feature: "attendanceEnabled",
  },
  view_team_attendance: {
    path: "/dashboard/attendance",
    params: { tab: "team-today" },
    label: "See who's present today",
    description: "Check your team's attendance for the current day.",
    required_role: "manager",
    required_plan: "starter",
    required_org_feature: "attendanceEnabled",
  },

  // Grievances
  submit_grievance: {
    path: "/dashboard/grievances",
    params: { tab: "submit" },
    label: "Submit a grievance",
    description: "Raise an issue with HR — optionally anonymous.",
    required_role: "employee",
    required_plan: "starter",
    required_org_feature: "grievancesEnabled",
  },
  triage_grievance: {
    path: "/dashboard/grievances",
    params: { tab: "inbox" },
    label: "Triage a grievance",
    description: "Review and update the status of an open grievance.",
    required_role: "admin",
    required_plan: "starter",
    required_org_feature: "grievancesEnabled",
  },

  // Announcements
  post_announcement: {
    path: "/dashboard/announcements",
    label: "Post a company announcement",
    description: "Share an org-wide note.",
    required_role: "admin",
    required_plan: "starter",
  },

  // Attendance settings (Phase 1 shifts + week-off)
  settings_attendance: {
    path: "/dashboard/settings",
    params: { section: "attendance" },
    label: "Configure attendance shifts and week-off",
    description:
      "Shift master, shift assignments, week-off policy, and default working hours.",
    required_role: "admin",
    required_plan: "starter",
    required_org_feature: "attendanceEnabled",
  },

  // Payroll settings
  settings_payroll: {
    path: "/dashboard/settings",
    params: { section: "payroll" },
    required_role: "admin",
    required_plan: "business",
    label: "Settings → Payroll",
    description:
      "Configure salary structure ratios (Basic, HRA, Gratuity), preview impact, and recompute all employees.",
  },

  // Settings + billing
  upgrade_plan: {
    path: "/dashboard/settings",
    params: { section: "billing" },
    label: "Upgrade your plan",
    description: "Move from Starter → Growth → Business.",
    required_role: "admin",
    required_plan: "starter",
  },
} as const satisfies Record<string, RouteEntry>;

export type RouteKey = keyof typeof ROUTE_REGISTRY;

export function getRoute(key: string): RouteEntry | null {
  return (ROUTE_REGISTRY as Record<string, RouteEntry>)[key] ?? null;
}
