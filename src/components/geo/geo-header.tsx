"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeoHeaderProps {
  isManagerOrAbove: boolean;
  orgName?: string;
}

interface NavItem {
  label: string;
  href: string;
  show: boolean;
}

// Single source of truth for the destination's section list. Sub-routes use
// startsWith() against the href, so order matters when prefixes overlap; the
// only one to watch is /geo/leads vs /geo/my-leads, handled by checking
// my-leads first inside the active calculation below.
const buildNavItems = (isManagerOrAbove: boolean): NavItem[] => [
  { label: "Leads", href: "/geo/leads", show: true },
  { label: "My Leads", href: "/geo/my-leads", show: !isManagerOrAbove },
  { label: "Geofences", href: "/geo/geofences", show: true },
  { label: "Live Map", href: "/geo/live-map", show: isManagerOrAbove },
  { label: "Reports", href: "/geo/reports", show: isManagerOrAbove },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // /geo/leads should not light up when on /geo/my-leads (longer prefix wins).
  if (href === "/geo/leads" && pathname.startsWith("/geo/my-leads")) return false;
  return pathname === href || pathname.startsWith(href + "/");
}

// Focus ring tuned for the dark-slate surface: amber on a slate-900 base sits
// at ~7:1 against the background and reads cleanly without ever feeling loud.
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";

export function GeoHeader({ isManagerOrAbove, orgName }: GeoHeaderProps) {
  const pathname = usePathname();
  const items = buildNavItems(isManagerOrAbove).filter((i) => i.show);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900 text-slate-100">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        {/* Brand */}
        <Link
          href="/geo/leads"
          aria-label="JambaGeo home"
          className={cn(
            "flex shrink-0 items-center gap-2.5 rounded-md py-1 transition-opacity hover:opacity-90",
            focusRing,
          )}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500"
            aria-hidden
          >
            <MapPin className="h-4 w-4 text-slate-900" strokeWidth={2.25} />
          </span>
          <span className="text-sm font-semibold tracking-tight">JambaGeo</span>
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="JambaGeo sections"
          className="hidden items-center gap-0.5 md:flex"
        >
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  focusRing,
                  active
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-3">
          {orgName ? (
            <span
              className="hidden max-w-[180px] truncate text-xs text-slate-400 lg:block"
              title={orgName}
            >
              {orgName}
            </span>
          ) : null}
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white",
              focusRing,
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Back to JambaHR</span>
            <span className="sm:hidden">Back</span>
          </Link>
        </div>
      </div>

      {/* Mobile nav — scrollable row directly under the brand bar */}
      <nav
        aria-label="JambaGeo sections"
        className="-mt-1 flex items-center gap-1 overflow-x-auto px-6 pb-2 md:hidden"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                focusRing,
                active
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
