/**
 * Pure logic for the /geo/reports time-range filter — kept in a non-
 * "use client" module so the Reports server page can import it without
 * pulling client-side React hooks (useRouter / useSearchParams) into
 * the server bundle.
 *
 * The client-side <ReportsRangeFilter> component imports the same
 * RANGE_OPTIONS / RangeKey / DEFAULT_RANGE constants from here so the
 * page and the filter agree on what each key means.
 */

export const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "quarter", label: "This quarter" },
  { value: "all", label: "All time" },
] as const;

export type RangeKey = (typeof RANGE_OPTIONS)[number]["value"];

export const DEFAULT_RANGE: RangeKey = "30d";

/**
 * Resolve a range key to an ISO date string (YYYY-MM-DD) bounding the
 * lower edge of the window. Returns undefined for "all" — the action
 * should skip the filter in that case.
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
