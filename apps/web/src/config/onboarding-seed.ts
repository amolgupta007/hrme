/**
 * Default seed data for a newly created organization.
 *
 * These constants used to live inside the Clerk `organization.created` webhook
 * (`src/app/api/webhooks/clerk/route.ts`). With Clerk Organizations decoupled,
 * org creation happens in the `createOrganization` server action, which seeds
 * these policies (holidays come from `@jambahr/shared/holidays/core-seed`). Kept here as a shared module imported by that
 * action.
 */

export const DEFAULT_LEAVE_POLICIES = [
  { name: "Casual Leave", type: "casual", days_per_year: 8, carry_forward: false, max_carry_forward_days: 0, applicable_from_months: 0, requires_approval: true },
  { name: "Sick Leave", type: "sick", days_per_year: 8, carry_forward: true, max_carry_forward_days: 4, applicable_from_months: 0, requires_approval: false },
  { name: "Earned Leave", type: "paid", days_per_year: 18, carry_forward: true, max_carry_forward_days: 30, applicable_from_months: 6, requires_approval: true },
  { name: "Leave Without Pay", type: "unpaid", days_per_year: 0, carry_forward: false, max_carry_forward_days: 0, applicable_from_months: 0, requires_approval: true },
];
