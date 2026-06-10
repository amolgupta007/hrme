"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_RANGE,
  RANGE_OPTIONS,
  type RangeKey,
} from "@/lib/geo/report-range";

/**
 * Time-range Select for the /geo/reports page. Updates the URL `range`
 * searchParam on change so the page re-renders with the new bounds.
 * URL-driven so the filter is shareable and survives reload.
 *
 * Defaults to "Last 30 days" — long enough to see weekly cadences,
 * short enough that the funnel reflects active pipeline rather than
 * archaeological data. The pure helpers (RANGE_OPTIONS, resolveRangeFrom)
 * live in src/lib/geo/report-range.ts so the server page can import
 * them without pulling client-only hooks into its bundle.
 */
export function ReportsRangeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams?.get("range") as RangeKey) ?? DEFAULT_RANGE;

  function onChange(value: string) {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (value === DEFAULT_RANGE) {
      // Don't write the default to the URL — keeps shareable URLs clean.
      next.delete("range");
    } else {
      next.set("range", value);
    }
    const query = next.toString();
    router.push(query ? `/geo/reports?${query}` : "/geo/reports");
  }

  return (
    <Select value={current} onValueChange={onChange}>
      <SelectTrigger className="w-[160px]" aria-label="Report time range">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
