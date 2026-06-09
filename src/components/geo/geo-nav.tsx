"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface GeoNavProps {
  isManagerOrAbove: boolean;
}

export function GeoNav({ isManagerOrAbove }: GeoNavProps) {
  const pathname = usePathname();

  const items = [
    { href: "/geo/leads", label: "Leads", show: true },
    { href: "/geo/my-leads", label: "My Leads", show: !isManagerOrAbove },
    { href: "/geo/geofences", label: "Geofences", show: true },
    { href: "/geo/live-map", label: "Live Map", show: isManagerOrAbove },
    { href: "/geo/reports", label: "Reports", show: isManagerOrAbove },
  ].filter(i => i.show);

  return (
    <nav className="flex gap-1 border-b mb-6">
      {items.map(item => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
