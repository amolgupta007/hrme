"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "all", label: "All time" },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]["value"];

const DEFAULT_RANGE: RangeKey = "30d";

/**
 * Time-range Select for the /geo/reports page. Updates the URL `range`
 * searchParam on change so the page re-renders with the new bounds.
 * URL-driven so the filter is shareable and survives reload.
 *
 * Defaults to "Last 30 days" — long enough to see weekly cadences,
 * short enough that the funnel reflects active pipeline rather than
 * archaeological data.
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

/**
 * Resolve a range key to an ISO date string (YYYY-MM-DD) bounding the
 * lower edge of the window. Returns undefined for "all" — the action
 * should skip the filter in that case.
 *
 * Lives in the same module so the page and the filter agree on what
 * each key means.
 */
export function resolveRangeFrom(range: string | undefined): string | undefined {
  const key = (range as RangeKey) ?? DEFAULT_RANGE;
  const today = new Date();
  switch (key) {
    case "7d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
    }
    case "30d": {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    }
    case "quarter": {
      const month = today.getMonth();
      const quarterStartMonth = month - (month % 3);
      const d = new Date(today.getFullYear(), quarterStartMonth, 1);
      return d.toISOString().slice(0, 10);
    }
    case "all":
      return undefined;
    default:
      // Unknown key → treat as default (30d) so a tampered URL still
      // renders something useful instead of all-time data.
      return resolveRangeFrom(DEFAULT_RANGE);
  }
}
