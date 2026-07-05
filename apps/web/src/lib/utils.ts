import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely (web-only — stays out of @jambahr/shared) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Pure formatters moved to @jambahr/shared (PRD-01 Phase B); re-exported
// here so existing `@/lib/utils` imports keep working unchanged.
export {
  formatDate,
  formatDateTime,
  timeAgo,
  formatRelativeDay,
  formatCurrency,
  capitalize,
  slugify,
  getInitials,
  sleep,
} from "@jambahr/shared/format";
