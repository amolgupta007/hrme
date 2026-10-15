-- 125: clock-in / clock-out reminders.
--
-- One row per (employee, IST date, kind) the reminder job has claimed. The row
-- is inserted BEFORE anything is sent (ON CONFLICT DO NOTHING), so two
-- overlapping runs can never remind the same person twice for the same thing.
-- email_status records what happened to the email for diagnosis.
--
-- Settings live in organizations.settings.attendance.reminders (no DDL).
-- The schedule itself is a pg_cron job calling /api/cron/attendance-reminders
-- every 5 minutes (set up separately — it needs the endpoint secret).

create table if not exists attendance_reminder_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('clock_in', 'clock_out')),
  email_status text check (email_status in ('sent', 'failed', 'skipped_no_email', 'skipped_disabled')),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_attendance_reminder_log
  on attendance_reminder_log (employee_id, date, kind);
create index if not exists idx_attendance_reminder_log_org_date
  on attendance_reminder_log (org_id, date);

-- Service role only (gotcha #5): RLS on, no policies.
alter table attendance_reminder_log enable row level security;

-- In-app reminders are notifications rows (mobile feed + push), so the type
-- list gains 'attendance_reminder'. Same list as migration 111, plus the new one.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'leave_decision'::text,
    'payslip_paid'::text,
    'doc_ack'::text,
    'announcement'::text,
    'approval_pending'::text,
    'late_penalty'::text,
    'attendance_reminder'::text
  ]));
