import { Home, Shuffle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Highlights remote and hybrid staff. Office is the default and renders
 * nothing unless `showOffice` is set, so lists stay quiet for the majority.
 * No hooks — safe in server and client components.
 */
export function WorkArrangementBadge({
  arrangement,
  showOffice = false,
  className,
}: {
  arrangement: string | null | undefined;
  showOffice?: boolean;
  className?: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap";
  if (arrangement === "remote") {
    return (
      <span className={cn(base, "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", className)}>
        <Home className="h-3 w-3" />
        Remote
      </span>
    );
  }
  if (arrangement === "hybrid") {
    return (
      <span className={cn(base, "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300", className)}>
        <Shuffle className="h-3 w-3" />
        Hybrid
      </span>
    );
  }
  if (!showOffice) return null;
  return <span className={cn(base, "bg-muted text-muted-foreground", className)}>Office</span>;
}
