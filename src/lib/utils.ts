import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a date for display */
export function formatDate(date: string | Date, pattern = "MMM d, yyyy") {
  return format(new Date(date), pattern);
}

/** Format a date with time-of-day. Used in places (e.g. visit timeline)
 *  where two interactions on the same day must read as distinct events. */
export function formatDateTime(date: string | Date, pattern = "MMM d, yyyy · h:mm a") {
  return format(new Date(date), pattern);
}

/** Relative time (e.g., "3 hours ago") */
export function timeAgo(date: string | Date) {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

/** Friendlier day-precision relative label for upcoming/past dates.
 *  Today / Yesterday / Tomorrow / In N days / N days ago. */
export function formatRelativeDay(date: string | Date): string {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

/** Format currency */
export function formatCurrency(
  amount: number,
  currency = "USD",
  locale = "en-US"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Capitalize first letter */
export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/** Slugify a string */
export function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Generate initials from a name */
export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Sleep utility for dev */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
