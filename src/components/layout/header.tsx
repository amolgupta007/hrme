"use client";

import { Search, Bell, Briefcase } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

interface HeaderProps {
  jambaHireEnabled?: boolean;
}

export function Header({ jambaHireEnabled = false }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-lg">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search employees, leaves, documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-muted/30 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-4">
        {/* JambaHire switcher */}
        {jambaHireEnabled && (
          <Link
            href="/hire"
            className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-400 dark:hover:bg-indigo-950"
          >
            <Briefcase className="h-3.5 w-3.5" />
            JambaHire
          </Link>
        )}

        <button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
}
