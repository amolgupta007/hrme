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
  },
  {
    title: "Leaves",
    href: "/dashboard/leaves",
    icon: "CalendarDays",
  },
  {
    title: "Documents",
    href: "/dashboard/documents",
    icon: "FileText",
  },
  {
    title: "Reviews",
    href: "/dashboard/reviews",
    icon: "Star",
    requiredRole: "manager",
  },
  {
    title: "Training",
    href: "/dashboard/training",
    icon: "GraduationCap",
  },
  {
    title: "Payroll",
    href: "/dashboard/payroll",
    icon: "Wallet",
    requiredRole: "admin",
  },
  {
    title: "Settings",
    href: "/dashboard/settings",
    icon: "Settings",
    requiredRole: "admin",
  },
];

export const APP_NAME = "HRFlow";
export const APP_DESCRIPTION =
  "All-in-one HR platform for small and medium businesses";
