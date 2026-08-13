-- ============================================================
-- MOBILE DEMO SEED — the tenant Apple/Google reviewers sign into
-- Run in: Supabase Dashboard → SQL Editor (Windows: gotcha #4)
--
-- Creates a self-contained demo org with everything the mobile app shows, so a
-- reviewer never lands on an empty screen. Every empty state in this app looks
-- like a broken app to someone who has never seen it working — an empty
-- payslip list reads as "feature doesn't work", and that is a rejection.
--
-- Seeds:
--   • org "JambaHR Demo Co" on the business plan, attendance + payroll on,
--     location-verified clock-in ON with one pinned office (so the reviewer
--     sees the consent notice and a tagged punch)
--   • 2 departments, 6 employees — including the two REVIEW accounts
--   • leave policies + balances-by-usage, approved + pending leave requests
--   • 30 days of attendance punch history for the demo employee
--   • a processed payroll run with payslips for everyone
--   • pending items in the admin's approvals inbox
--
-- Idempotent: re-running is a no-op once the demo org exists.
--
-- BEFORE RUNNING: set the two review email addresses below to the demo mailbox
-- you created (see docs/mobile-release/01-app-review-notes.md — a fixed Clerk
-- test code will NOT work against the production instance, so these must be
-- addresses whose inbox you can share with the reviewer).
-- ============================================================

DO $$
DECLARE
  -- >>> EDIT THESE TWO BEFORE RUNNING <<<
  demo_employee_email text := 'demo.employee@jambahr.com';
  demo_admin_email    text := 'demo.admin@jambahr.com';

  v_org        uuid;
  d_ops        uuid;
  d_eng        uuid;
  e_admin      uuid;
  e_employee   uuid;
  e_other      uuid;
  v_loc        uuid;
  v_shift      uuid;
  p_casual     uuid;
  p_sick       uuid;
  p_earned     uuid;
  v_run        uuid;
  v_entry      uuid;
  d            date;
  i            int;
BEGIN
  -- ---------- org ----------
  SELECT id INTO v_org FROM public.organizations WHERE name = 'JambaHR Demo Co';
  IF v_org IS NOT NULL THEN
    RAISE NOTICE 'Demo org already exists (%) — nothing to do.', v_org;
    RETURN;
  END IF;

  v_org := gen_random_uuid();
  INSERT INTO public.organizations (id, name, plan, max_employees, settings)
  VALUES (
    v_org,
    'JambaHR Demo Co',
    'business',
    50,
    jsonb_build_object(
      'attendance_enabled', true,
      'attendance_payroll_enabled', true,
      'grievances_enabled', true,
      'attendance', jsonb_build_object(
        'standard_workday_hours', 8,
        -- The reviewer must see this flow, so the demo org has it on.
        'location_punch', jsonb_build_object(
          'enabled', true,
          'mode', 'optional',      -- never 'required' here: a simulator with no
                                   -- GPS fix would be unable to clock in at all
          'default_radius_m', 250
        )
      )
    )
  );

  -- ---------- departments ----------
  d_ops := gen_random_uuid();
  d_eng := gen_random_uuid();
  INSERT INTO public.departments (id, org_id, name)
  VALUES (d_ops, v_org, 'Operations'), (d_eng, v_org, 'Engineering');

  -- ---------- office with a geofence ----------
  -- Bandra Kurla Complex, Mumbai. Coordinates matter: the demo employee's
  -- seeded punches below are placed inside this fence so the reviewer sees a
  -- real "At Head Office" tag rather than an unevaluated blank.
  v_loc := gen_random_uuid();
  INSERT INTO public.locations (id, org_id, name, address, is_active, lat, lng, geofence_radius_m)
  VALUES (v_loc, v_org, 'Head Office', 'Bandra Kurla Complex, Mumbai 400051', true,
          19.0654, 72.8679, 250);

  -- ---------- shift ----------
  v_shift := gen_random_uuid();
  INSERT INTO public.shifts (id, org_id, name, start_time, end_time, total_hours,
                             break_minutes, grace_minutes, is_default, is_active)
  VALUES (v_shift, v_org, 'General', '09:30', '18:30', 8, 60, 15, true, true);

  -- ---------- employees ----------
  e_admin    := gen_random_uuid();
  e_employee := gen_random_uuid();
  e_other    := gen_random_uuid();

  INSERT INTO public.employees
    (id, org_id, first_name, last_name, email, role, department_id, status,
     employment_type, designation, date_of_joining)
  VALUES
    (e_admin, v_org, 'Demo', 'Admin', demo_admin_email, 'owner', d_ops, 'active',
     'full_time', 'Operations Head', current_date - interval '3 years'),
    (e_employee, v_org, 'Demo', 'Employee', demo_employee_email, 'employee', d_eng, 'active',
     'full_time', 'Software Engineer', current_date - interval '18 months'),
    (e_other, v_org, 'Rahul', 'Verma', 'rahul.demo@jambahr.com', 'employee', d_eng, 'active',
     'full_time', 'QA Engineer', current_date - interval '2 years');

  UPDATE public.departments SET head_id = e_admin WHERE id = d_ops;
  UPDATE public.departments SET head_id = e_admin WHERE id = d_eng;
  UPDATE public.employees SET reporting_manager_id = e_admin
   WHERE id IN (e_employee, e_other);

  INSERT INTO public.shift_assignments (id, org_id, employee_id, shift_id, date_from, type)
  SELECT gen_random_uuid(), v_org, emp, v_shift, current_date - interval '90 days', 'fixed'
  FROM unnest(ARRAY[e_admin, e_employee, e_other]) AS emp;

  -- ---------- leave ----------
  p_casual := gen_random_uuid();
  p_sick   := gen_random_uuid();
  p_earned := gen_random_uuid();
  INSERT INTO public.leave_policies (id, org_id, name, type, days_per_year, carry_forward)
  VALUES
    (p_casual, v_org, 'Casual Leave', 'casual', 8, false),
    (p_sick,   v_org, 'Sick Leave',   'sick',   8, false),
    (p_earned, v_org, 'Earned Leave', 'paid',  18, true);

  -- Approved history gives the balance cards non-zero "used" numbers; the
  -- pending one populates the admin's approvals inbox.
  INSERT INTO public.leave_requests
    (id, org_id, employee_id, leave_policy_id, start_date, end_date, days, status, reason)
  VALUES
    (gen_random_uuid(), v_org, e_employee, p_casual,
     current_date - interval '40 days', current_date - interval '39 days', 2, 'approved', 'Family function'),
    (gen_random_uuid(), v_org, e_employee, p_sick,
     current_date - interval '20 days', current_date - interval '20 days', 1, 'approved', 'Fever'),
    (gen_random_uuid(), v_org, e_employee, p_earned,
     current_date + interval '10 days', current_date + interval '12 days', 3, 'pending', 'Short holiday'),
    (gen_random_uuid(), v_org, e_other, p_casual,
     current_date + interval '5 days', current_date + interval '5 days', 1, 'pending', 'Personal work');

  -- ---------- holidays ----------
  INSERT INTO public.holidays (id, org_id, name, date, is_optional)
  VALUES
    (gen_random_uuid(), v_org, 'Independence Day', make_date(extract(year from current_date)::int, 8, 15), false),
    (gen_random_uuid(), v_org, 'Gandhi Jayanti',   make_date(extract(year from current_date)::int, 10, 2), false),
    (gen_random_uuid(), v_org, 'Diwali',           make_date(extract(year from current_date)::int, 11, 1), false)
  ON CONFLICT DO NOTHING;

  -- ---------- 30 working days of attendance ----------
  -- Punch events AND the daily rollup: the month calendar reads the rollup,
  -- while the day-detail sheet reads events, so seeding only one leaves half
  -- the attendance UI looking broken.
  i := 0;
  FOR d IN
    SELECT gs::date FROM generate_series(current_date - interval '40 days', current_date - interval '1 day', '1 day') gs
  LOOP
    CONTINUE WHEN extract(isodow from d) IN (6, 7);   -- weekends off
    EXIT WHEN i >= 30;
    i := i + 1;

    INSERT INTO public.attendance_punch_events
      (id, org_id, employee_id, punched_at, source, status, lat, lng, accuracy_m,
       geo_status, matched_location_id, geo_label, created_by)
    VALUES
      (gen_random_uuid(), v_org, e_employee, (d + time '09:34') AT TIME ZONE 'Asia/Kolkata',
       'mobile', 'approved', 19.0655, 72.8680, 12, 'office', v_loc, 'Head Office', e_employee),
      (gen_random_uuid(), v_org, e_employee, (d + time '18:41') AT TIME ZONE 'Asia/Kolkata',
       'mobile', 'approved', 19.0655, 72.8680, 14, 'office', v_loc, 'Head Office', e_employee);

    INSERT INTO public.attendance_records
      (id, org_id, employee_id, date, clock_in_at, clock_out_at, total_minutes, source, shift_id)
    VALUES
      (gen_random_uuid(), v_org, e_employee, d,
       (d + time '09:34') AT TIME ZONE 'Asia/Kolkata',
       (d + time '18:41') AT TIME ZONE 'Asia/Kolkata',
       547, 'mobile', v_shift)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- One remote day so the reviewer sees BOTH verdicts, not just "at office".
  INSERT INTO public.attendance_punch_events
    (id, org_id, employee_id, punched_at, source, status, lat, lng, accuracy_m,
     geo_status, geo_label, created_by)
  VALUES
    (gen_random_uuid(), v_org, e_employee,
     (current_date - interval '3 days' + time '09:50') AT TIME ZONE 'Asia/Kolkata',
     'mobile', 'approved', 19.1136, 72.8697, 30, 'remote', 'Andheri East, Mumbai', e_employee);

  -- ---------- payroll ----------
  INSERT INTO public.salary_structures
    (id, org_id, employee_id, ctc, basic_monthly, hra_monthly, special_allowance_monthly,
     gross_monthly, net_monthly, state, is_metro, include_hra, effective_from, tax_regime)
  VALUES
    (gen_random_uuid(), v_org, e_employee, 1200000, 40000, 20000, 40000,
     100000, 88000, 'Maharashtra', true, true, current_date - interval '18 months', 'new'),
    (gen_random_uuid(), v_org, e_admin, 1800000, 60000, 30000, 60000,
     150000, 129000, 'Maharashtra', true, true, current_date - interval '3 years', 'new'),
    (gen_random_uuid(), v_org, e_other, 900000, 30000, 15000, 30000,
     75000, 67000, 'Maharashtra', true, true, current_date - interval '2 years', 'new');

  -- Two PAID runs so the payslip list isn't a single lonely row.
  FOR i IN 1..2 LOOP
    v_run := gen_random_uuid();
    INSERT INTO public.payroll_runs (id, org_id, month, status, working_days, processed_at, paid_at)
    VALUES (v_run, v_org,
            to_char(current_date - (i || ' month')::interval, 'YYYY-MM'),
            'paid', 22, now() - (i || ' month')::interval, now() - (i || ' month')::interval);

    INSERT INTO public.payroll_entries
      (id, org_id, payroll_run_id, employee_id, gross_salary, employee_pf,
       professional_tax, tds, lop_days, lop_deduction, net_pay)
    VALUES
      (gen_random_uuid(), v_org, v_run, e_employee, 100000, 1800, 200, 10000, 0, 0, 88000),
      (gen_random_uuid(), v_org, v_run, e_admin,    150000, 1800, 200, 19000, 0, 0, 129000),
      (gen_random_uuid(), v_org, v_run, e_other,     75000, 1800, 200,  6000, 0, 0, 67000);
  END LOOP;

  RAISE NOTICE 'Demo org seeded: % (employee=%, admin=%)', v_org, demo_employee_email, demo_admin_email;
END $$;
