"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FileText,
  Star,
  GraduationCap,
  Wallet,
  Settings,
  ChevronLeft,
  UserCircle,
  Network,
  Target,
  Megaphone,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sidebarNav, APP_NAME } from "@/config/navigation";
import { useState } from "react";
import type { PendingCounts } from "@/actions/notifications";
import { hasPermission } from "@/types";
import type { UserRole } from "@/types";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  CalendarDays,
  FileText,
  Star,
  GraduationCap,
  Wallet,
  Settings,
  Network,
  Target,
  Megaphone,
};

// Map nav href to badge key
const BADGE_MAP: Record<string, keyof PendingCounts> = {
  "/dashboard/leaves": "leaves",
  "/dashboard/documents": "documents",
  "/dashboard/objectives": "objectives",
};

export function Sidebar({ badges, role }: { badges: PendingCounts; role: UserRole }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const visibleNav = sidebarNav.filter((item) =>
    !item.requiredRole || hasPermission(role, item.requiredRole)
  );

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            <span className="text-primary">Jamba</span>
            <span className="text-sidebar-foreground">HR</span>
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 transition-transform",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {visibleNav.map((item) => {
            const Icon = iconMap[item.icon] || LayoutDashboard;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" &&
                pathname.startsWith(item.href));

            const badgeKey = BADGE_MAP[item.href];
            const badgeCount = badgeKey ? badges[badgeKey] : 0;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <span className="relative shrink-0">
                    <Icon className="h-[18px] w-[18px]" />
                    {badgeCount > 0 && collapsed && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {badgeCount > 9 ? "9+" : badgeCount}
                      </span>
                    )}
                  </span>
                  {!collapsed && <span>{item.title}</span>}
                  {!collapsed && badgeCount > 0 && (
                    <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          >
            <UserButton.MenuItems>
              <UserButton.Link
                label="My Profile"
                labelIcon={<UserCircle className="h-4 w-4" />}
                href="/dashboard/profile"
              />
            </UserButton.MenuItems>
          </UserButton>
          {!collapsed && (
            <span className="text-sm text-sidebar-foreground/70 truncate">
              Account
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
