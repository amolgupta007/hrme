"use client";

import { Info, TriangleAlert } from "lucide-react";
import { normFor } from "@jambahr/shared/payroll/norms";

/**
 * The industry-norm side note under a payroll setting (plan D5). Advisory
 * only: it explains what is usual and, if the current value differs, says so
 * in amber — it never blocks a save.
 */
export function NormNote({ normKey, value }: { normKey: string; value?: unknown }) {
  const norm = normFor(normKey);
  if (!norm) return null;
  const hint = value !== undefined && norm.deviates ? norm.deviates(value) : null;
  return (
    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
      <p className="flex gap-1.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground/80">Usual practice{norm.typical ? `: ${norm.typical}` : ""}.</span>{" "}
          {norm.text}{" "}
          <span className="whitespace-nowrap">
            (as of {norm.asOf}{norm.statutory ? "; confirm with your CA" : ""})
          </span>
        </span>
      </p>
      {hint && (
        <p className="flex gap-1.5 text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{hint}</span>
        </p>
      )}
    </div>
  );
}
