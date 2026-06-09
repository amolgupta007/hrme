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

  // Attendance Phase 2 — roster, overtime, week-off override
  attendance_roster: {
    path: "/dashboard/attendance",
    params: { tab: "roster" },
    label: "Attendance → Roster",
    description:
      "Weekly roster grid. Drag shifts onto employee cells. Managers see own department.",
    required_role: "manager",
    required_plan: "starter",
    required_org_feature: "attendanceEnabled",
  },
  attendance_overtime: {
    path: "/dashboard/attendance",
    params: { tab: "overtime" },
    label: "Attendance → Overtime",
    description:
      "Approve, reject, and push overtime to payroll. Visible only when overtime is enabled.",
    required_role: "admin",
    required_plan: "starter",
    required_org_feature: "attendanceEnabled",
  },
  settings_overtime: {
    path: "/dashboard/settings",
    params: { section: "attendance" },
    label: "Settings → Attendance → Overtime",
    description:
      "Master toggle for overtime, multiplier, threshold mode, approval-required.",
    required_role: "admin",
    required_plan: "starter",
    required_org_feature: "attendanceEnabled",
  },
  settings_week_off_override: {
    path: "/dashboard/settings",
    params: { section: "attendance" },
    label: "Settings → Attendance → Week-off Overrides",
    description:
      "Per-employee week-off override (e.g. 6-day employee in a 5-day org).",
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

  // Payroll Phase 2 — RazorpayX disbursement
  settings_razorpayx: {
    path: "/dashboard/settings",
    params: { section: "payroll-razorpayx" },
    required_role: "admin",
    required_plan: "business",
    label: "Settings → Payroll → RazorpayX",
    description:
      "Connect, test, and disconnect RazorpayX for online salary disbursement.",
  },
  payroll_disbursement: {
    path: "/dashboard/payroll",
    required_role: "admin",
    required_plan: "business",
    label: "Payroll → Disbursement",
    description:
      "Initiate, approve, and reconcile RazorpayX salary disbursement batches.",
  },
  profile_bank_account: {
    path: "/dashboard/profile",
    params: { section: "bank-account" },
    required_role: "employee",
    required_plan: "starter",
    label: "Profile → Bank Account",
    description:
      "Add or update your bank account for salary disbursement.",
  },

  // JambaGeo (Business tier)
  geo_overview: {
    path: "/dashboard/geo/leads",
    label: "JambaGeo overview",
    description: "Lightweight CRM and field-staff tracking module for sales / service / delivery teams.",
    required_role: "employee",
    required_plan: "business",
  },
  geo_create_lead: {
    path: "/dashboard/geo/leads",
    label: "Create a lead",
    description: "Add a new lead to the CRM with name, company, contact details, and stage.",
    required_role: "manager",
    required_plan: "business",
  },
  geo_assign_lead: {
    path: "/dashboard/geo/leads",
    label: "Assign or reassign a lead",
    description: "Set or change which staff member owns a lead.",
    required_role: "manager",
    required_plan: "business",
  },
  geo_log_visit: {
    path: "/dashboard/geo/leads/[id]",
    label: "Log a visit on a lead",
    description: "Record a field visit with outcome, notes, and next follow-up date.",
    required_role: "employee",
    required_plan: "business",
  },
  geo_kanban_drag: {
    path: "/dashboard/geo/leads",
    label: "Move a lead through the kanban",
    description: "Drag a lead card between pipeline stages or use the stage dropdown.",
    required_role: "employee",
    required_plan: "business",
  },
  geo_geofences: {
    path: "/dashboard/geo/geofences",
    label: "Manage geofences",
    description: "Draw geofence zones on the map for offices and client sites.",
    required_role: "admin",
    required_plan: "business",
  },
  geo_reports: {
    path: "/dashboard/geo/reports",
    label: "Lead reports",
    description: "View funnel metrics, conversion rates, and overdue follow-ups.",
    required_role: "manager",
    required_plan: "business",
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
