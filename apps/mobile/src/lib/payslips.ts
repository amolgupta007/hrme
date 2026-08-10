/** Query keys + label helpers for the Payslips screens (Task 7). */

/** Query key for the payslip list — orgId in the key (multi-org isolation). */
export function payslipsQueryKey(orgId: string | null | undefined) {
  return ["mobile", "payslips", orgId] as const;
}

/** Query key for one payslip's detail. */
export function payslipQueryKey(orgId: string | null | undefined, entryId: string) {
  return ["mobile", "payslip", orgId, entryId] as const;
}

const FULL_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-07" → "July 2026". Plain string parse, no tz shift. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${FULL_MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** ISO instant → "14 Aug 2026" (device-local). Used for the paid-on line. */
export function paidOnLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
