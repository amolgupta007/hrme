/**
 * Default seed data for a newly created organization.
 *
 * These constants used to live inside the Clerk `organization.created` webhook
 * (`src/app/api/webhooks/clerk/route.ts`). With Clerk Organizations decoupled,
 * org creation happens in the `createOrganization` server action, which seeds
 * the same policies + holidays. Kept here as a shared module imported by that
 * action.
 */

export const DEFAULT_LEAVE_POLICIES = [
  { name: "Casual Leave", type: "casual", days_per_year: 8, carry_forward: false, max_carry_forward_days: 0, applicable_from_months: 0, requires_approval: true },
  { name: "Sick Leave", type: "sick", days_per_year: 8, carry_forward: true, max_carry_forward_days: 4, applicable_from_months: 0, requires_approval: false },
  { name: "Earned Leave", type: "paid", days_per_year: 18, carry_forward: true, max_carry_forward_days: 30, applicable_from_months: 6, requires_approval: true },
  { name: "Leave Without Pay", type: "unpaid", days_per_year: 0, carry_forward: false, max_carry_forward_days: 0, applicable_from_months: 0, requires_approval: true },
];

export const DEFAULT_HOLIDAYS_2026 = [
  { name: "New Year's Day", date: "2026-01-01", is_optional: false },
  { name: "Republic Day", date: "2026-01-26", is_optional: false },
  { name: "Holi", date: "2026-03-03", is_optional: false },
  { name: "Good Friday", date: "2026-04-03", is_optional: true },
  { name: "Eid ul-Fitr", date: "2026-03-31", is_optional: true },
  { name: "Ambedkar Jayanti", date: "2026-04-14", is_optional: false },
  { name: "Eid ul-Adha", date: "2026-06-07", is_optional: true },
  { name: "Independence Day", date: "2026-08-15", is_optional: false },
  { name: "Janmashtami", date: "2026-08-20", is_optional: true },
  { name: "Gandhi Jayanti", date: "2026-10-02", is_optional: false },
  { name: "Dussehra", date: "2026-10-11", is_optional: false },
  { name: "Diwali", date: "2026-10-29", is_optional: false },
  { name: "Christmas", date: "2026-12-25", is_optional: false },
];
