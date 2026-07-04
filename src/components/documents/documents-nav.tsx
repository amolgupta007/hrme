"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Send, ShieldCheck, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/documents/templates", label: "Templates", icon: FileText },
  { href: "/dashboard/documents/issue", label: "Issue", icon: Send },
  { href: "/dashboard/documents/signed", label: "Signed Records", icon: ShieldCheck },
];

export function DocumentsNav() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-1 border-b border-border mb-6">
      <Link
        href="/dashboard/documents"
        className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px"
        title="Back to Documents"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
