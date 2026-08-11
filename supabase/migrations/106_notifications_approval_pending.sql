-- 106_notifications_approval_pending.sql
-- D4 (Owner/Admin, PRD-03) — approver-side push. Adds the 'approval_pending'
-- notification type used when a new pending approval (leave/regularization/OT/
-- payroll) is created and the approver is notified + deep-linked to /approvals.
-- Applied live via Supabase MCP.

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
  check (type = any (array[
    'leave_decision'::text,
    'payslip_paid'::text,
    'doc_ack'::text,
    'announcement'::text,
    'approval_pending'::text
  ]));
