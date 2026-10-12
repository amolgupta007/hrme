-- 124: comp-off leave type + cancelling approved leave.
--
-- Comp-off is a leave type with NO balance: each request names the week-off /
-- holiday the employee worked (comp_off_worked_date) plus a reason, and the
-- approval is the control. One worked day can back only one live
-- (pending/approved) comp-off request — the partial unique index below.
--
-- cancelled_at / cancelled_by record who withdrew a request, now that an
-- approved leave can be cancelled too.
--
-- Additive and idempotent. Apply BEFORE deploying the code: cancelLeave writes
-- cancelled_at/cancelled_by on every cancel.

alter table leave_policies drop constraint if exists leave_policies_type_check;
alter table leave_policies add constraint leave_policies_type_check
  check (type in ('paid', 'unpaid', 'sick', 'casual', 'maternity', 'paternity', 'custom', 'comp_off'));

alter table leave_requests
  add column if not exists comp_off_worked_date date,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references employees(id) on delete set null;

create unique index if not exists uq_leave_requests_comp_off_worked_date
  on leave_requests (employee_id, comp_off_worked_date)
  where comp_off_worked_date is not null and status in ('pending', 'approved');

comment on column leave_requests.comp_off_worked_date is 'Comp-off only: the week-off or holiday the employee worked, which this request redeems.';
