-- Medialoop usage analysis — October + November 2026 (Nov is month-to-date)
-- READ-ONLY. Run in the Supabase SQL Editor (project imjwqktxzahhnfmfbtfc) or via the Supabase MCP.
-- Every query is scoped to Medialoop's org id and grouped by month so Oct vs Nov sit side by side.
-- Column names verified against migrations 001, 065, 078/102, 109, 111, 112, 113, 124, 125.

-- ───────────────────────────────────────────────────────────────────────────
-- Q0. Headcount + how many of them have ever logged in (clerk_user_id linked)
-- ───────────────────────────────────────────────────────────────────────────
select status, work_arrangement, count(*) as people,
       count(*) filter (where clerk_user_id is not null) as linked_login
from employees
where org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
group by 1, 2 order by 1, 2;

-- ───────────────────────────────────────────────────────────────────────────
-- Q1. Attendance adoption per month: days recorded, days actually clocked in,
--     device-only days ("present, not clocked in"), forgot-to-clock-out rate,
--     average hours and first-arrival time (IST)
-- ───────────────────────────────────────────────────────────────────────────
select to_char(date, 'YYYY-MM')                                   as month,
       count(distinct employee_id)                                as people_with_any_record,
       count(*)                                                   as person_days,
       count(*) filter (where clock_in_at is not null)            as clocked_in_days,
       count(*) filter (where clock_in_at is null
                          and device_first_seen_at is not null)   as device_only_not_clocked_in,
       count(*) filter (where auto_closed)                        as auto_closed_days,
       round(100.0 * count(*) filter (where auto_closed)
             / nullif(count(*) filter (where clock_in_at is not null), 0), 1) as pct_forgot_clock_out,
       round(avg(total_minutes) filter (where clock_in_at is not null and not auto_closed) / 60.0, 2)
                                                                  as avg_hours_manual_close,
       to_char(avg((clock_in_at at time zone 'Asia/Kolkata')::time), 'HH24:MI')
                                                                  as avg_arrival_ist
from attendance_records
where org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and date between '2026-10-01' and '2026-11-30'
group by 1 order by 1;

-- ───────────────────────────────────────────────────────────────────────────
-- Q2. Punch channel mix — is the web clock-in (and mobile app) actually used?
--     Also shows whether the eSSL device came back (adms/device rows).
-- ───────────────────────────────────────────────────────────────────────────
select to_char(punched_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
       source,
       count(*)                       as punches,
       count(distinct employee_id)    as people
from attendance_punch_events
where org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and punched_at >= '2026-09-30T18:30:00Z'   -- 1 Oct 00:00 IST
group by 1, 2 order by 1, 2;

-- ───────────────────────────────────────────────────────────────────────────
-- Q3. Per-employee scorecard (the core table for the client conversation)
-- ───────────────────────────────────────────────────────────────────────────
select e.first_name || ' ' || coalesce(e.last_name, '')            as employee,
       e.role, e.work_arrangement,
       to_char(a.date, 'YYYY-MM')                                  as month,
       count(*) filter (where a.clock_in_at is not null)           as clocked_in_days,
       count(*) filter (where a.clock_in_at is null
                          and a.device_first_seen_at is not null)  as not_clocked_in_days,
       count(*) filter (where a.is_late and not a.late_excused)    as late_days,
       count(*) filter (where a.late_excused)                      as excused_days,
       round(avg(a.late_minutes) filter (where a.is_late))         as avg_late_min,
       count(*) filter (where a.auto_closed)                       as forgot_clock_out,
       round(sum(a.total_minutes) / 60.0, 1)                       as total_hours
from employees e
left join attendance_records a
       on a.employee_id = e.id
      and a.date between '2026-10-01' and '2026-11-30'
where e.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and e.status <> 'terminated'
group by 1, 2, 3, 4
order by 4, late_days desc nulls last, 1;

-- ───────────────────────────────────────────────────────────────────────────
-- Q4. Lateness distribution by arrival band (IST) — how late is "late"?
-- ───────────────────────────────────────────────────────────────────────────
select to_char(date, 'YYYY-MM') as month,
       case when late_minutes <= 5   then '0-5 min'
            when late_minutes <= 15  then '6-15 min'
            when late_minutes <= 30  then '16-30 min'
            when late_minutes <= 60  then '31-60 min'
            else '60+ min' end       as band,
       count(*) as late_days
from attendance_records
where org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and date between '2026-10-01' and '2026-11-30'
  and is_late and not late_excused
group by 1, 2 order by 1, min(late_minutes);

-- ───────────────────────────────────────────────────────────────────────────
-- Q5. Late-arrival ladder outcomes: warnings, CL/LOP deductions, waivers,
--     email delivery, and anything stuck in needs_review
-- ───────────────────────────────────────────────────────────────────────────
select month, kind, status,
       count(*)                    as events,
       count(distinct employee_id) as people,
       sum(cl_days)                as cl_days,
       sum(lop_days)               as lop_days,
       count(*) filter (where email_status = 'sent')   as emails_sent,
       count(*) filter (where email_status = 'failed') as emails_failed
from late_penalty_events
where org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and month in ('2026-10', '2026-11')
group by 1, 2, 3 order by 1, 2, 3;

-- ───────────────────────────────────────────────────────────────────────────
-- Q6. Leave: requests by type + status, days, approval turnaround, comp-off,
--     half-days, cancellations of approved leave
-- ───────────────────────────────────────────────────────────────────────────
select to_char(lr.start_date, 'YYYY-MM')                    as month,
       lp.type                                              as leave_type,
       lr.status,
       count(*)                                             as requests,
       sum(lr.days)                                         as days,
       count(*) filter (where lr.start_half_day or lr.end_half_day) as half_day_requests,
       count(*) filter (where lr.cancelled_at is not null)  as cancelled_after_approval_or_pending,
       round(avg(extract(epoch from (lr.reviewed_at - lr.created_at)) / 3600)
             filter (where lr.reviewed_at is not null), 1) as avg_hours_to_decision
from leave_requests lr
join leave_policies lp on lp.id = lr.policy_id
where lr.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and lr.start_date between '2026-10-01' and '2026-11-30'
group by 1, 2, 3 order by 1, 2, 3;

-- Q6b. Leave requests still pending (approver backlog)
select e.first_name, lp.type, lr.start_date, lr.days, lr.created_at
from leave_requests lr
join employees e on e.id = lr.employee_id
join leave_policies lp on lp.id = lr.policy_id
where lr.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba' and lr.status = 'pending'
order by lr.created_at;

-- ───────────────────────────────────────────────────────────────────────────
-- Q7. Work from home: volume, over-quota, who decided, turnaround
-- ───────────────────────────────────────────────────────────────────────────
select to_char(w.date, 'YYYY-MM')        as month,
       w.status,
       count(*)                          as days,
       count(distinct w.employee_id)     as people,
       count(*) filter (where w.over_quota) as over_quota_days,
       count(*) filter (where w.date = (w.created_at at time zone 'Asia/Kolkata')::date) as same_day_requests,
       round(avg(extract(epoch from (w.decided_at - w.created_at)) / 3600)
             filter (where w.decided_at is not null), 1) as avg_hours_to_decision
from wfh_requests w
where w.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and w.date between '2026-10-01' and '2026-11-30'
group by 1, 2 order by 1, 2;

-- Q7b. Did approved WFH days actually get a clock-in? (policy assumes yes)
select to_char(w.date, 'YYYY-MM') as month,
       count(*) as approved_wfh_days,
       count(a.clock_in_at) as with_clock_in
from wfh_requests w
left join attendance_records a on a.employee_id = w.employee_id and a.date = w.date
where w.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and w.status = 'approved' and w.date between '2026-10-01' and '2026-11-30'
group by 1 order by 1;

-- ───────────────────────────────────────────────────────────────────────────
-- Q8. Clock-in/clock-out reminders (live from 2026-10-15) — and did they work?
--     "converted" = clocked in later the same day after a clock-in reminder.
-- ───────────────────────────────────────────────────────────────────────────
select to_char(r.date, 'YYYY-MM') as month, r.kind, r.email_status,
       count(*) as reminders,
       count(distinct r.employee_id) as people,
       count(*) filter (where r.kind = 'clock_in' and a.clock_in_at > r.created_at) as clocked_in_after
from attendance_reminder_log r
left join attendance_records a on a.employee_id = r.employee_id and a.date = r.date
where r.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and r.date between '2026-10-01' and '2026-11-30'
group by 1, 2, 3 order by 1, 2, 3;

-- ───────────────────────────────────────────────────────────────────────────
-- Q9. Announcements + acknowledgement completion
-- ───────────────────────────────────────────────────────────────────────────
select a.title, a.created_at::date as published, a.ack_required, a.ack_due_date,
       (select count(*) from announcement_recipients r where r.announcement_id = a.id) as recipients,
       (select count(distinct k.employee_id) from announcement_acknowledgements k
         where k.announcement_id = a.id and k.version >= a.ack_version) as acknowledged
from announcements a
where a.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and a.created_at >= '2026-10-01' and a.archived_at is null
order by a.created_at;

-- ───────────────────────────────────────────────────────────────────────────
-- Q10. Payroll: which runs exist for Sep/Oct/Nov, status, totals, slips emailed
-- ───────────────────────────────────────────────────────────────────────────
select r.month, r.status, r.processed_at::date, r.paid_at::date,
       count(e.id)          as entries,
       sum(e.gross_salary)  as gross,
       sum(e.net_pay)       as net,
       sum(e.lop_days)      as lop_days,
       sum(e.late_penalty_days) as late_penalty_days,
       (select count(*) from payslip_deliveries d
          join payroll_entries pe on pe.id = d.payroll_entry_id
         where pe.payroll_run_id = r.id and d.status = 'sent') as slips_emailed
from payroll_runs r
left join payroll_entries e on e.payroll_run_id = r.id
where r.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and r.month >= '2026-08'
group by r.id order by r.month;

-- ───────────────────────────────────────────────────────────────────────────
-- Q11. AI assistant usage (only if assistant_enabled for Medialoop)
-- ───────────────────────────────────────────────────────────────────────────
select to_char(m.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
       count(*) filter (where m.role = 'user') as questions,
       count(distinct c.user_employee_id)      as people
from assistant_messages m
join assistant_conversations c on c.id = m.conversation_id
where c.org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and m.created_at >= '2026-10-01'
group by 1 order by 1;

-- ───────────────────────────────────────────────────────────────────────────
-- Q12. Engagement breadth: in-app notifications by type (proxy for which
--      features are generating activity)
-- ───────────────────────────────────────────────────────────────────────────
select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month, type,
       count(*) as notifications,
       count(*) filter (where read_at is not null) as read
from notifications
where org_id = '9829a0cd-0ec0-4236-90e6-54d1d4a13cba'
  and created_at >= '2026-10-01'
group by 1, 2 order by 1, 3 desc;
