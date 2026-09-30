-- ============================================================
-- DEMO: late-arrival penalty ladder — PlayPause Studios (September 2026)
-- Run in: Supabase SQL Editor (production) or via MCP. Idempotent: re-run to reset.
--
-- Seeds a "Warning + leave deduction" late policy and six employees whose
-- September attendance walks through every state the Attendance → Late
-- arrivals tab can show:
--   Kavya Iyer   2 lates                    — nothing yet
--   Rohan Mehra  3 lates                    — formal warning
--   Neha Sharma  5 lates                    — warning + 1 CL deducted
--   Sahil Joshi  6 lates, 1 excused (5 count) — warning + 1 CL deducted
--   Yash Mishra  10 lates                   — warning + 2 CL deductions
--   Divya Bansal 5 lates                    — warning + deduction WAIVED by Harry
--
-- Written directly (no engine run), so NO emails or notifications are sent.
-- The data is exactly what the engine would compute (fallback cutoff 10:30 IST,
-- no shift assignments, Sat/Sun week-off, no holidays/leave), so the nightly
-- late-policy reconcile finds nothing to change and stays silent.
-- ============================================================

DO $BODY$
DECLARE
  v_org    uuid := '851a0785-a98e-45b7-8bc9-9940c157ba9f';
  v_owner  uuid := 'ac0082ca-dc0f-431e-a0f6-71bd0a41e132'; -- Harry G (owner)
  v_cl     uuid := 'ccc00001-0000-0000-0000-000000000003'; -- Casual Leave (7/yr)
  v_policy uuid;
  e_kavya  uuid := 'e2c00001-0000-0000-0000-000000000004';
  e_rohan  uuid := 'e2c00001-0000-0000-0000-000000000006';
  e_neha   uuid := 'e2c00001-0000-0000-0000-000000000005';
  e_sahil  uuid := 'e2c00001-0000-0000-0000-000000000010';
  e_yash   uuid := 'e2c00001-0000-0000-0000-000000000029';
  e_divya  uuid := 'e2c00001-0000-0000-0000-000000000020';
  demo     uuid[];
BEGIN
  demo := ARRAY[e_kavya, e_rohan, e_neha, e_sahil, e_yash, e_divya];
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'PlayPause Studios org not found';
  END IF;

  -- ── Reset previous demo rows ─────────────────────────────────────────────
  -- leave_adjustments is append-only (trigger); lift it just for the reset.
  ALTER TABLE public.leave_adjustments DISABLE TRIGGER leave_adjustments_immutable;
  DELETE FROM public.leave_adjustments
   WHERE org_id = v_org AND employee_id = ANY(demo) AND source IN ('late_penalty', 'late_penalty_reversal');
  ALTER TABLE public.leave_adjustments ENABLE TRIGGER leave_adjustments_immutable;
  DELETE FROM public.late_penalty_events WHERE org_id = v_org AND employee_id = ANY(demo);
  DELETE FROM public.attendance_records
   WHERE org_id = v_org AND employee_id = ANY(demo) AND date BETWEEN '2026-09-01' AND '2026-09-30';

  -- ── Policy ───────────────────────────────────────────────────────────────
  INSERT INTO public.late_policies (
    org_id, enabled, name, threshold_days, fallback_cutoff_time, notify_on_late, notify_on_threshold,
    channel_email, channel_whatsapp, consequence, evaluate_from,
    ladder_warning_at, ladder_deduct_at, ladder_leave_type, ladder_deduct_days, ladder_repeat,
    ladder_lop_fallback, ladder_cc_managers, ladder_cc_admins, ladder_dispute_days
  ) VALUES (
    v_org, true, 'Late arrivals', 3, '10:30', false, false,
    true, false, 'leave_deduction', '2026-09-01',
    3, 5, 'casual', 1, true,
    true, true, false, 2
  )
  ON CONFLICT (org_id) DO UPDATE SET
    enabled = true, name = EXCLUDED.name, fallback_cutoff_time = EXCLUDED.fallback_cutoff_time,
    notify_on_late = false, notify_on_threshold = false, channel_email = true, channel_whatsapp = false,
    consequence = 'leave_deduction', evaluate_from = '2026-09-01',
    ladder_warning_at = 3, ladder_deduct_at = 5, ladder_leave_type = 'casual', ladder_deduct_days = 1,
    ladder_repeat = true, ladder_lop_fallback = true, ladder_cc_managers = true, ladder_cc_admins = false,
    ladder_dispute_days = 2, updated_at = now()
  RETURNING id INTO v_policy;

  DELETE FROM public.late_policy_targets WHERE policy_id = v_policy;
  INSERT INTO public.late_policy_targets (org_id, policy_id, target_type, target_id)
  SELECT v_org, v_policy, 'employee', t FROM unnest(demo) t;

  -- ── Attendance: (employee, date, IST clock-in HH:MM, excused reason) ─────
  -- late_minutes = clock-in − 10:30 IST (the policy's fallback cutoff).
  INSERT INTO public.attendance_records (
    org_id, employee_id, date, clock_in_at, clock_out_at, total_minutes, source,
    is_late, late_minutes, late_policy_id, late_excused, late_excused_by, late_excused_at, late_excuse_reason
  )
  SELECT v_org, s.emp, s.d::date,
         (s.d || 'T' || s.t || ':00+05:30')::timestamptz,
         (s.d || 'T19:30:00+05:30')::timestamptz,
         (EXTRACT(EPOCH FROM ((s.d || 'T19:30:00+05:30')::timestamptz - (s.d || 'T' || s.t || ':00+05:30')::timestamptz)) / 60)::int,
         'device', true,
         (EXTRACT(EPOCH FROM ((s.d || 'T' || s.t || ':00+05:30')::timestamptz - (s.d || 'T10:30:00+05:30')::timestamptz)) / 60)::int,
         v_policy,
         s.reason IS NOT NULL,
         CASE WHEN s.reason IS NOT NULL THEN v_owner END,
         CASE WHEN s.reason IS NOT NULL THEN (s.d || 'T18:00:00+05:30')::timestamptz END,
         s.reason
  FROM (VALUES
    (e_kavya, '2026-09-08', '10:42', NULL), (e_kavya, '2026-09-22', '10:51', NULL),

    (e_rohan, '2026-09-03', '10:38', NULL), (e_rohan, '2026-09-10', '10:47', NULL),
    (e_rohan, '2026-09-17', '10:55', NULL),

    (e_neha, '2026-09-01', '10:41', NULL), (e_neha, '2026-09-04', '10:36', NULL),
    (e_neha, '2026-09-09', '10:52', NULL), (e_neha, '2026-09-15', '10:44', NULL),
    (e_neha, '2026-09-21', '10:58', NULL),

    (e_sahil, '2026-09-02', '11:20', 'Client meeting at the brand''s office — approved'),
    (e_sahil, '2026-09-07', '10:39', NULL), (e_sahil, '2026-09-11', '10:45', NULL),
    (e_sahil, '2026-09-16', '10:50', NULL), (e_sahil, '2026-09-23', '10:37', NULL),
    (e_sahil, '2026-09-28', '10:48', NULL),

    (e_yash, '2026-09-01', '10:40', NULL), (e_yash, '2026-09-03', '10:52', NULL),
    (e_yash, '2026-09-07', '10:35', NULL), (e_yash, '2026-09-09', '11:05', NULL),
    (e_yash, '2026-09-11', '10:44', NULL), (e_yash, '2026-09-14', '10:49', NULL),
    (e_yash, '2026-09-16', '10:38', NULL), (e_yash, '2026-09-18', '10:56', NULL),
    (e_yash, '2026-09-22', '10:43', NULL), (e_yash, '2026-09-24', '11:02', NULL),

    (e_divya, '2026-09-04', '10:44', NULL), (e_divya, '2026-09-08', '10:40', NULL),
    (e_divya, '2026-09-14', '10:53', NULL), (e_divya, '2026-09-18', '10:46', NULL),
    (e_divya, '2026-09-25', '10:57', NULL)
  ) AS s(emp, d, t, reason);

  -- ── Ladder steps (what the engine would have recorded) ───────────────────
  -- helper: warnings
  INSERT INTO public.late_penalty_events
    (org_id, policy_id, employee_id, month, kind, occurrence_no, late_count, late_record_ids, trigger_date, created_at, updated_at)
  SELECT v_org, v_policy, w.emp, '2026-09', 'warning', 1, 3,
         ARRAY(SELECT r.id FROM public.attendance_records r
                WHERE r.org_id = v_org AND r.employee_id = w.emp AND r.date BETWEEN '2026-09-01' AND '2026-09-30'
                  AND r.is_late AND NOT r.late_excused ORDER BY r.date LIMIT 3),
         w.d::date, (w.d || 'T20:00:00+05:30')::timestamptz, (w.d || 'T20:00:00+05:30')::timestamptz
  FROM (VALUES (e_rohan, '2026-09-17'), (e_neha, '2026-09-09'), (e_sahil, '2026-09-16'),
               (e_yash, '2026-09-07'), (e_divya, '2026-09-14')) AS w(emp, d);

  -- deductions: (employee, occurrence, trigger date, CL balance before, status)
  INSERT INTO public.late_penalty_events
      (org_id, policy_id, employee_id, month, kind, occurrence_no, late_count, late_record_ids, trigger_date,
       cl_days, lop_days, cl_balance_before, leave_policy_id, status, status_reason, status_by, status_at, created_at, updated_at)
    SELECT v_org, v_policy, x.emp, '2026-09', 'deduction', x.occ, x.occ * 5,
           ARRAY(SELECT r.id FROM public.attendance_records r
                  WHERE r.org_id = v_org AND r.employee_id = x.emp AND r.date BETWEEN '2026-09-01' AND '2026-09-30'
                    AND r.is_late AND NOT r.late_excused ORDER BY r.date LIMIT x.occ * 5),
           x.d::date, 1, 0, x.bal, v_cl, x.st,
           CASE WHEN x.st = 'waived' THEN 'First offence — discussed with her manager' END,
           CASE WHEN x.st = 'waived' THEN v_owner END,
           (x.d || 'T20:00:00+05:30')::timestamptz + CASE WHEN x.st = 'waived' THEN interval '2 days' ELSE interval '0' END,
           (x.d || 'T20:00:00+05:30')::timestamptz, now()
    FROM (VALUES
      (e_neha,  1, '2026-09-21', 7.0, 'applied'),
      (e_sahil, 1, '2026-09-28', 6.0, 'applied'),
      (e_yash,  1, '2026-09-11', 5.0, 'applied'),
      (e_yash,  2, '2026-09-24', 4.0, 'applied'),
      (e_divya, 1, '2026-09-25', 7.0, 'waived')
    ) AS x(emp, occ, d, bal, st);

  -- CL ledger: one debit per deduction; the waived one also gets its credit back.
  INSERT INTO public.leave_adjustments (org_id, employee_id, policy_id, year, days, reason, source, source_ref, created_by, created_at)
  SELECT v_org, e.employee_id, v_cl, 2026, -1, 'Late-arrival penalty', 'late_penalty', e.id, NULL, e.created_at
  FROM public.late_penalty_events e
  WHERE e.org_id = v_org AND e.employee_id = ANY(demo) AND e.kind = 'deduction';

  INSERT INTO public.leave_adjustments (org_id, employee_id, policy_id, year, days, reason, source, source_ref, created_by, created_at)
  SELECT v_org, e.employee_id, v_cl, 2026, 1, 'Late-arrival penalty reversed', 'late_penalty_reversal', e.id, v_owner, e.status_at
  FROM public.late_penalty_events e
  WHERE e.org_id = v_org AND e.employee_id = ANY(demo) AND e.kind = 'deduction' AND e.status = 'waived';

  RAISE NOTICE 'Late-penalty demo seeded for PlayPause Studios (policy %)', v_policy;
END
$BODY$;
