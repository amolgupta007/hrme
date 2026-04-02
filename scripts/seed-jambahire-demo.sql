-- ============================================================
-- JAMBAHIRE DEMO SEED — test1 org
-- Run in: Supabase Dashboard → SQL Editor
-- Seeds: 4 jobs, 10 candidates, applications across pipeline stages,
--        interview schedules, feedback, and 2 offers
-- ============================================================

DO $$
DECLARE
  v_org_id        UUID;
  v_admin_id      UUID;
  v_eng_dept_id   UUID;
  v_mkt_dept_id   UUID;
  v_sales_dept_id UUID;

  -- Job IDs
  v_job_swe       UUID := gen_random_uuid();
  v_job_pm        UUID := gen_random_uuid();
  v_job_mkt       UUID := gen_random_uuid();
  v_job_sales     UUID := gen_random_uuid();

  -- Candidate IDs
  v_c1 UUID := gen_random_uuid();
  v_c2 UUID := gen_random_uuid();
  v_c3 UUID := gen_random_uuid();
  v_c4 UUID := gen_random_uuid();
  v_c5 UUID := gen_random_uuid();
  v_c6 UUID := gen_random_uuid();
  v_c7 UUID := gen_random_uuid();
  v_c8 UUID := gen_random_uuid();
  v_c9 UUID := gen_random_uuid();
  v_c10 UUID := gen_random_uuid();

  -- Application IDs
  v_app1  UUID := gen_random_uuid();
  v_app2  UUID := gen_random_uuid();
  v_app3  UUID := gen_random_uuid();
  v_app4  UUID := gen_random_uuid();
  v_app5  UUID := gen_random_uuid();
  v_app6  UUID := gen_random_uuid();
  v_app7  UUID := gen_random_uuid();
  v_app8  UUID := gen_random_uuid();
  v_app9  UUID := gen_random_uuid();
  v_app10 UUID := gen_random_uuid();

  -- Interview IDs
  v_int1 UUID := gen_random_uuid();
  v_int2 UUID := gen_random_uuid();
  v_int3 UUID := gen_random_uuid();

  -- Offer IDs
  v_offer1 UUID := gen_random_uuid();
  v_offer2 UUID := gen_random_uuid();

BEGIN
  -- Get org
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'test1' LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'test1 org not found'; END IF;

  -- Get admin employee (to use as created_by / interviewer)
  SELECT id INTO v_admin_id FROM employees
  WHERE org_id = v_org_id AND role IN ('owner', 'admin')
  ORDER BY created_at LIMIT 1;

  -- Get department IDs
  SELECT id INTO v_eng_dept_id   FROM departments WHERE org_id = v_org_id AND name ILIKE '%engineer%' LIMIT 1;
  SELECT id INTO v_mkt_dept_id   FROM departments WHERE org_id = v_org_id AND name ILIKE '%market%'   LIMIT 1;
  SELECT id INTO v_sales_dept_id FROM departments WHERE org_id = v_org_id AND name ILIKE '%sales%'    LIMIT 1;

  -- ============================================================
  -- JOBS
  -- ============================================================
  INSERT INTO jobs (id, org_id, title, description, employment_type, location_type, location, salary_min, salary_max, show_salary, status, created_by, created_at)
  VALUES
    (v_job_swe,   v_org_id, 'Senior Software Engineer',       'We are looking for a Senior Software Engineer to join our growing engineering team. You will design and build scalable backend systems, mentor junior developers, and collaborate with product and design.', 'full_time', 'hybrid',   'Mumbai, India',   1800000, 2800000, true,  'active', v_admin_id, now() - interval '30 days'),
    (v_job_pm,    v_org_id, 'Product Manager',                'Seeking a Product Manager to own our core HR product roadmap. You will work closely with engineering, design, and customers to define and ship features that delight users.', 'full_time', 'hybrid',   'Mumbai, India',   1500000, 2200000, true,  'active', v_admin_id, now() - interval '25 days'),
    (v_job_mkt,   v_org_id, 'Digital Marketing Manager',      'We need a data-driven Digital Marketing Manager to grow our organic and paid acquisition channels. SEO, content, and performance marketing experience required.', 'full_time', 'remote',   'Remote — India',  1000000, 1500000, false, 'active', v_admin_id, now() - interval '20 days'),
    (v_job_sales, v_org_id, 'B2B Sales Executive',            'Looking for a hungry B2B Sales Executive to help us grow our SMB customer base. You will own the full sales cycle from prospecting to close.', 'full_time', 'on_site',  'Mumbai, India',    800000, 1400000, false, 'active', v_admin_id, now() - interval '15 days')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- CANDIDATES
  -- ============================================================
  INSERT INTO candidates (id, org_id, name, email, phone, linkedin_url, source, tags, created_at)
  VALUES
    (v_c1,  v_org_id, 'Arjun Mehta',       'arjun.mehta@gmail.com',      '+91-9820001001', 'https://linkedin.com/in/arjunmehta',       'linkedin',  '["strong", "backend"]',            now() - interval '28 days'),
    (v_c2,  v_org_id, 'Priya Sharma',      'priya.sharma@gmail.com',     '+91-9820001002', 'https://linkedin.com/in/priyasharma',      'referral',  '["product", "b2b-experience"]',    now() - interval '24 days'),
    (v_c3,  v_org_id, 'Rohan Verma',       'rohan.verma@gmail.com',      '+91-9820001003', NULL,                                       'naukri',    '["frontend", "react"]',            now() - interval '22 days'),
    (v_c4,  v_org_id, 'Sneha Patil',       'sneha.patil@gmail.com',      '+91-9820001004', 'https://linkedin.com/in/snehapatil',       'linkedin',  '["marketing", "seo"]',             now() - interval '20 days'),
    (v_c5,  v_org_id, 'Karan Singh',       'karan.singh@gmail.com',      '+91-9820001005', NULL,                                       'naukri',    '["sales", "saas"]',                now() - interval '18 days'),
    (v_c6,  v_org_id, 'Ananya Iyer',       'ananya.iyer@gmail.com',      '+91-9820001006', 'https://linkedin.com/in/ananyaiyer',       'linkedin',  '["fullstack", "node", "strong"]',  now() - interval '15 days'),
    (v_c7,  v_org_id, 'Vikram Nair',       'vikram.nair@gmail.com',      '+91-9820001007', NULL,                                       'referral',  '["product", "ux"]',                now() - interval '12 days'),
    (v_c8,  v_org_id, 'Deepika Rao',       'deepika.rao@gmail.com',      '+91-9820001008', 'https://linkedin.com/in/deepikarao',       'linkedin',  '["content", "digital-marketing"]', now() - interval '10 days'),
    (v_c9,  v_org_id, 'Aditya Kulkarni',   'aditya.kulkarni@gmail.com',  '+91-9820001009', NULL,                                       'naukri',    '["sales", "outbound"]',            now() - interval '8 days'),
    (v_c10, v_org_id, 'Meera Joshi',       'meera.joshi@gmail.com',      '+91-9820001010', 'https://linkedin.com/in/meerajoshi',       'linkedin',  '["backend", "python", "strong"]',  now() - interval '5 days')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- APPLICATIONS — spread across pipeline stages
  -- ============================================================
  INSERT INTO applications (id, org_id, job_id, candidate_id, stage, cover_note, applied_at, updated_at)
  VALUES
    -- SWE role — full funnel demo
    (v_app1,  v_org_id, v_job_swe, v_c1,  'offer',        'Excited about the backend engineering opportunity.',  now() - interval '27 days', now() - interval '2 days'),
    (v_app2,  v_org_id, v_job_swe, v_c3,  'final_round',  'I have 4 years of React and Node experience.',        now() - interval '21 days', now() - interval '3 days'),
    (v_app6,  v_org_id, v_job_swe, v_c6,  'interview_2',  'Full-stack with strong system design background.',    now() - interval '14 days', now() - interval '4 days'),
    (v_app10, v_org_id, v_job_swe, v_c10, 'screening',    'Python backend, 6 years exp, open to Mumbai.',        now() - interval '4 days',  now() - interval '1 day'),
    -- PM role
    (v_app3,  v_org_id, v_job_pm,  v_c2,  'interview_1',  '3 years PM at a B2B SaaS startup.',                  now() - interval '23 days', now() - interval '5 days'),
    (v_app7,  v_org_id, v_job_pm,  v_c7,  'applied',      'Product and UX background, MBA from XLRI.',           now() - interval '11 days', now() - interval '11 days'),
    -- Marketing role
    (v_app4,  v_org_id, v_job_mkt, v_c4,  'hired',        'SEO and performance marketing, 5 years exp.',        now() - interval '19 days', now() - interval '1 day'),
    (v_app8,  v_org_id, v_job_mkt, v_c8,  'interview_1',  'Content and digital marketing, strong portfolio.',   now() - interval '9 days',  now() - interval '3 days'),
    -- Sales role
    (v_app5,  v_org_id, v_job_sales, v_c5,  'offer',      'B2B SaaS sales, 3 years, strong quota attainment.',  now() - interval '17 days', now() - interval '1 day'),
    (v_app9,  v_org_id, v_job_sales, v_c9,  'screening',  'Outbound sales experience, startup background.',     now() - interval '7 days',  now() - interval '2 days')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- INTERVIEW SCHEDULES
  -- ============================================================
  INSERT INTO interview_schedules (id, org_id, application_id, interviewer_id, scheduled_at, duration_minutes, interview_type, meeting_link, notes, status, created_at)
  VALUES
    (v_int1, v_org_id, v_app1, v_admin_id, now() - interval '10 days', 60, 'video',    'https://meet.google.com/abc-defg-hij', 'System design round. Focus on distributed systems.',     'completed', now() - interval '12 days'),
    (v_int2, v_org_id, v_app2, v_admin_id, now() - interval '5 days',  45, 'video',    'https://meet.google.com/klm-nopq-rst', 'Frontend architecture and React patterns.',              'completed', now() - interval '6 days'),
    (v_int3, v_org_id, v_app3, v_admin_id, now() + interval '2 days',  60, 'in_person','Conference Room B, Floor 3',           'Product sense and case study — bring a laptop.',         'scheduled', now() - interval '3 days')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- INTERVIEW FEEDBACK
  -- ============================================================
  INSERT INTO interview_feedback (id, org_id, schedule_id, interviewer_id, technical_rating, communication_rating, culture_fit_rating, overall_rating, recommendation, notes, submitted_at)
  VALUES
    (gen_random_uuid(), v_org_id, v_int1, v_admin_id, 5, 4, 5, 5, 'strong_yes', 'Excellent system design. Handled the distributed caching problem cleanly. Strong communicator. Recommend moving to offer stage.', now() - interval '9 days'),
    (gen_random_uuid(), v_org_id, v_int2, v_admin_id, 4, 4, 3, 4, 'yes',        'Solid React knowledge. Good problem-solving. Culture fit uncertain — needs a second round with the team.', now() - interval '4 days')
  ON CONFLICT (schedule_id, interviewer_id) DO NOTHING;

  -- ============================================================
  -- OFFERS
  -- ============================================================
  INSERT INTO offers (id, org_id, application_id, ctc, joining_date, role_title, department_id, reporting_manager_id, additional_terms, status, offer_token, created_at)
  VALUES
    (v_offer1, v_org_id, v_app1, 2400000, (now() + interval '30 days')::date, 'Senior Software Engineer', v_eng_dept_id,   v_admin_id, 'Includes ₹50,000 joining bonus. 5 days WFH per month after probation.',  'sent',    gen_random_uuid(), now() - interval '2 days'),
    (v_offer2, v_org_id, v_app5, 1200000, (now() + interval '21 days')::date, 'B2B Sales Executive',      v_sales_dept_id, v_admin_id, 'Variable component: ₹2,00,000 annual target incentive on quota attainment.', 'accepted', gen_random_uuid(), now() - interval '1 day')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'JambaHire demo data seeded for org: %', v_org_id;
  RAISE NOTICE '  Jobs: 4 (SWE, PM, Marketing, Sales)';
  RAISE NOTICE '  Candidates: 10';
  RAISE NOTICE '  Applications: 10 (spread across all stages)';
  RAISE NOTICE '  Interviews: 3 (2 completed, 1 scheduled)';
  RAISE NOTICE '  Feedback: 2';
  RAISE NOTICE '  Offers: 2 (1 sent, 1 accepted)';

END $$;
