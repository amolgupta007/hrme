import type { NavItem } from "@/types";

export const sidebarNav: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard",
  },
  {
    title: "Employees",
    href: "/dashboard/employees",
    icon: "Users",
    requiredRole: "manager",
  },
  {
    title: "Directory",
    href: "/dashboard/directory",
    icon: "Network",
  },
  {
    title: "Leaves",
    href: "/dashboard/leaves",
    icon: "CalendarDays",
    hideForContractor: true,
  },
  {
    title: "Documents",
    href: "/dashboard/documents",
    icon: "FileText",
    requiredPlan: "growth",
  },
  {
    title: "Reviews",
    href: "/dashboard/reviews",
    icon: "Star",
    requiredRole: "manager",
    requiredPlan: "growth",
    hideForContractor: true,
  },
  {
    title: "Objectives",
    href: "/dashboard/objectives",
    icon: "Target",
    requiredPlan: "growth",
    hideForContractor: true,
  },
  {
    title: "Training",
    href: "/dashboard/training",
    icon: "GraduationCap",
    requiredPlan: "growth",
    hideForContractor: true,
  },
  {
    title: "Attendance",
    href: "/dashboard/attendance",
    icon: "Clock",
    featureFlag: "attendance",
  },
  {
    title: "My Interviews",
    href: "/dashboard/my-interviews",
    icon: "CalendarDays",
    featureFlag: "jambahire",
  },
  {
    title: "Refer",
    href: "/dashboard/refer",
    icon: "UserPlus",
    featureFlag: "referrals",
    hideForContractor: true,
  },
  {
    title: "Grievances",
    href: "/dashboard/grievances",
    icon: "MessageSquareWarning",
    featureFlag: "grievances",
  },
  {
    title: "Announcements",
    href: "/dashboard/announcements",
    icon: "Megaphone",
  },
  {
    title: "Payroll",
    href: "/dashboard/payroll",
    icon: "Wallet",
    requiredRole: "admin",
    requiredPlan: "business",
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: "Settings",
    requiredRole: "admin",
  },
];

export const APP_NAME = "JambaHR";
export const APP_DESCRIPTION =
  "All-in-one HR platform for small and medium businesses";
