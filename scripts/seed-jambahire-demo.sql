-- ============================================================
-- JAMBAHIRE DEMO SEED — The Man Project (D2C men's grooming brand)
-- Run in: Supabase Dashboard → SQL Editor
-- Seeds: 5 jobs (real hiring managers), 14 candidates + applications
--        across ALL 9 pipeline stages (incl. one shortlisted w/ LOI
--        pending), 7 interviews, 6 feedback rows, 3 offers, and a full
--        candidate_stage_transitions timeline per application.
-- Idempotent: re-running is a no-op once the PMM job exists.
-- Employees/departments are resolved dynamically by designation/name,
-- so this is portable across reseeds of the org.
-- ============================================================

DO $$
DECLARE
  v_org uuid;
  v_owner uuid; v_hr uuid;
  d_perf uuid; d_prod uuid; d_tech uuid; d_brand uuid; d_cx uuid;
  v_priya uuid; v_rajesh uuid; v_aryan uuid; v_aanya uuid; v_megha uuid;
  v_sahil uuid; v_aditi uuid; v_tara uuid; v_neha uuid; v_anjali uuid;
  j_pmm uuid := gen_random_uuid();
  j_form uuid := gen_random_uuid();
  j_be uuid := gen_random_uuid();
  j_sm uuid := gen_random_uuid();
  j_cx uuid := gen_random_uuid();
  c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid();
  c4 uuid:=gen_random_uuid(); c5 uuid:=gen_random_uuid(); c6 uuid:=gen_random_uuid();
  c7 uuid:=gen_random_uuid(); c8 uuid:=gen_random_uuid(); c9 uuid:=gen_random_uuid();
  c10 uuid:=gen_random_uuid(); c11 uuid:=gen_random_uuid(); c12 uuid:=gen_random_uuid();
  c13 uuid:=gen_random_uuid(); c14 uuid:=gen_random_uuid();
  apA uuid:=gen_random_uuid(); apB uuid:=gen_random_uuid(); apC uuid:=gen_random_uuid();
  apD uuid:=gen_random_uuid(); apE uuid:=gen_random_uuid(); apF uuid:=gen_random_uuid();
  apG uuid:=gen_random_uuid(); apH uuid:=gen_random_uuid(); apI uuid:=gen_random_uuid();
  apJ uuid:=gen_random_uuid(); apK uuid:=gen_random_uuid(); apL uuid:=gen_random_uuid();
  apM uuid:=gen_random_uuid(); apN uuid:=gen_random_uuid();
  -- NB: interview-schedule vars are `is*`-prefixed; a bare `iD` lowercases
  -- to the `id` column and `iN` to the reserved word IN (both break plpgsql).
  isB uuid:=gen_random_uuid(); isE1 uuid:=gen_random_uuid(); isE2 uuid:=gen_random_uuid();
  isG uuid:=gen_random_uuid(); isD uuid:=gen_random_uuid(); isJ uuid:=gen_random_uuid(); isN uuid:=gen_random_uuid();
  rec record; i int;
BEGIN
  SELECT o.id INTO v_org FROM organizations o WHERE o.name ILIKE '%man project%' LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'The Man Project org not found'; END IF;

  IF EXISTS (SELECT 1 FROM jobs WHERE org_id=v_org AND title='Performance Marketing Manager') THEN
    RAISE NOTICE 'JambaHire demo already seeded; skipping'; RETURN;
  END IF;

  SELECT e.id INTO v_owner FROM employees e WHERE e.org_id=v_org AND e.role='owner' LIMIT 1;
  SELECT e.id INTO v_hr     FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'HR & Finance Manager' LIMIT 1;
  SELECT dp.id INTO d_perf  FROM departments dp WHERE dp.org_id=v_org AND dp.name ILIKE '%performance%' LIMIT 1;
  SELECT dp.id INTO d_prod  FROM departments dp WHERE dp.org_id=v_org AND dp.name ILIKE '%product%' LIMIT 1;
  SELECT dp.id INTO d_tech  FROM departments dp WHERE dp.org_id=v_org AND dp.name ILIKE '%technology%' LIMIT 1;
  SELECT dp.id INTO d_brand FROM departments dp WHERE dp.org_id=v_org AND dp.name ILIKE '%brand%' LIMIT 1;
  SELECT dp.id INTO d_cx    FROM departments dp WHERE dp.org_id=v_org AND dp.name ILIKE '%customer%' LIMIT 1;
  SELECT e.id INTO v_priya  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'VP Performance Marketing' LIMIT 1;
  SELECT e.id INTO v_rajesh FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Head of Product Development' LIMIT 1;
  SELECT e.id INTO v_aryan  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Chief Technology Officer' LIMIT 1;
  SELECT e.id INTO v_aanya  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'VP Brand & Content' LIMIT 1;
  SELECT e.id INTO v_megha  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Head of Customer Experience' LIMIT 1;
  SELECT e.id INTO v_sahil  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Performance Analyst' LIMIT 1;
  SELECT e.id INTO v_aditi  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Senior Formulator' LIMIT 1;
  SELECT e.id INTO v_tara   FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Senior Engineer' LIMIT 1;
  SELECT e.id INTO v_neha   FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Social Media Manager' LIMIT 1;
  SELECT e.id INTO v_anjali FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'CX Manager' LIMIT 1;

  -- ===== JOBS =====
  INSERT INTO jobs (id, org_id, title, department_id, description, employment_type, location_type, location, salary_min, salary_max, show_salary, status, hiring_manager_id, created_by, created_at) VALUES
  (j_pmm, v_org, 'Performance Marketing Manager', d_perf, 'Own paid acquisition across Meta, Google and quick-commerce for a fast-growing D2C men''s grooming brand. You will manage a 7-figure monthly ad budget, drive blended ROAS, and partner with the creative team on winning hooks.', 'full_time','hybrid','Mumbai, India', 1400000, 2000000, true, 'active', v_priya, v_owner, now()-interval '32 days'),
  (j_form, v_org, 'Senior Cosmetic Formulator', d_prod, 'Formulate next-gen men''s skincare, beard and hair products. Lead bench-to-batch development, stability testing and vendor scale-up. Cosmetic science degree + 5 yrs personal-care R&D required.', 'full_time','on_site','Mumbai (R&D Lab), India', 1200000, 1800000, true, 'active', v_rajesh, v_owner, now()-interval '26 days'),
  (j_be, v_org, 'Backend Engineer — Shopify & Node', d_tech, 'Build the headless commerce stack powering themanproject.in: Shopify Hydrogen storefront APIs, Node services, subscriptions and warehouse integrations. Strong TypeScript + Postgres.', 'full_time','remote','Remote — India', 1800000, 2800000, false, 'active', v_aryan, v_owner, now()-interval '21 days'),
  (j_sm, v_org, 'Social Media Manager', d_brand, 'Run our Instagram, YouTube Shorts and influencer engine. Build a content calendar, brief creators, and grow an engaged community of modern Indian men. Sharp copy + trend instinct essential.', 'full_time','hybrid','Mumbai, India', 1000000, 1500000, true, 'active', v_aanya, v_owner, now()-interval '18 days'),
  (j_cx, v_org, 'Customer Experience Associate', d_cx, 'Be the voice of the brand across chat, email and social DMs. Resolve order issues, turn detractors into fans, and feed insights back to product. Empathy + crisp writing required.', 'full_time','on_site','Mumbai, India', 400000, 700000, false, 'active', v_megha, v_owner, now()-interval '14 days');

  -- ===== CANDIDATES =====
  INSERT INTO candidates (id, org_id, name, email, phone, linkedin_url, source, tags, created_at) VALUES
  (c1, v_org,'Kabir Malhotra','kabir.malhotra@gmail.com','+91-98200-31001','https://linkedin.com/in/kabirmalhotra','linkedin','["paid-social","d2c","strong"]', now()-interval '30 days'),
  (c2, v_org,'Ishita Desai','ishita.desai@gmail.com','+91-98200-31002','https://linkedin.com/in/ishitadesai','linkedin','["growth","roas"]', now()-interval '28 days'),
  (c3, v_org,'Farhan Sheikh','farhan.sheikh@gmail.com','+91-98200-31003',NULL,'naukri','["marketing"]', now()-interval '27 days'),
  (c4, v_org,'Nandini Pillai','nandini.pillai@gmail.com','+91-98200-31004','https://linkedin.com/in/nandinipillai','referral','["formulation","skincare","strong"]', now()-interval '25 days'),
  (c5, v_org,'Vivek Anand','vivek.anand@gmail.com','+91-98200-31005',NULL,'linkedin','["cosmetic-science","r&d"]', now()-interval '24 days'),
  (c6, v_org,'Pooja Deshmukh','pooja.deshmukh@gmail.com','+91-98200-31006',NULL,'naukri','["formulation","junior"]', now()-interval '12 days'),
  (c7, v_org,'Siddharth Jain','siddharth.jain@gmail.com','+91-98200-31007','https://linkedin.com/in/siddharthjain','linkedin','["node","typescript","shopify"]', now()-interval '19 days'),
  (c8, v_org,'Aisha Qureshi','aisha.qureshi@gmail.com','+91-98200-31008','https://linkedin.com/in/aishaqureshi','referral','["backend","postgres","strong"]', now()-interval '17 days'),
  (c9, v_org,'Harsh Vardhan','harsh.vardhan@gmail.com','+91-98200-31009',NULL,'indeed','["fullstack","react"]', now()-interval '6 days'),
  (c10, v_org,'Tanvi Kulkarni','tanvi.kulkarni@gmail.com','+91-98200-31010','https://linkedin.com/in/tanvikulkarni','linkedin','["social","content","reels"]', now()-interval '16 days'),
  (c11, v_org,'Rahul Bhatt','rahul.bhatt@gmail.com','+91-98200-31011',NULL,'naukri','["social-media","copy"]', now()-interval '5 days'),
  (c12, v_org,'Zoya Khan','zoya.khan@gmail.com','+91-98200-31012','https://linkedin.com/in/zoyakhan','referral','["cx","support","strong"]', now()-interval '15 days'),
  (c13, v_org,'Imran Ali','imran.ali@gmail.com','+91-98200-31013',NULL,'indeed','["support","chat"]', now()-interval '8 days'),
  (c14, v_org,'Simran Kaur','simran.kaur@gmail.com','+91-98200-31014','https://linkedin.com/in/simrankaur','linkedin','["cx"]', now()-interval '20 days');

  -- ===== APPLICATIONS (all 9 stages) =====
  INSERT INTO applications (id, org_id, job_id, candidate_id, stage, cover_note, applied_at, updated_at, loi_status, loi_sent_at, loi_expires_at) VALUES
  (apA, v_org, j_pmm, c1,'offer','9 yrs scaling D2C brands on Meta + Google. Took my last brand from 2x to 4.5x blended ROAS.', now()-interval '29 days', now()-interval '2 days', NULL,NULL,NULL),
  (apB, v_org, j_pmm, c2,'interview_2','Growth marketer, ex-Sugar Cosmetics. Love what The Man Project is building.', now()-interval '27 days', now()-interval '4 days', NULL,NULL,NULL),
  (apC, v_org, j_pmm, c3,'rejected','Performance marketing generalist, 3 yrs.', now()-interval '26 days', now()-interval '20 days', NULL,NULL,NULL),
  (apD, v_org, j_form, c4,'hired','Senior formulator, 8 yrs in men''s personal care. Excited to lead your R&D.', now()-interval '24 days', now()-interval '1 day', NULL,NULL,NULL),
  (apE, v_org, j_form, c5,'final_round','Cosmetic chemist with strong stability-testing background.', now()-interval '23 days', now()-interval '3 days', NULL,NULL,NULL),
  (apF, v_org, j_form, c6,'screening','Junior formulator keen to grow into senior bench work.', now()-interval '11 days', now()-interval '6 days', NULL,NULL,NULL),
  (apG, v_org, j_be, c7,'interview_1','Node + Shopify Hydrogen engineer, 5 yrs.', now()-interval '18 days', now()-interval '5 days', NULL,NULL,NULL),
  (apH, v_org, j_be, c8,'shortlisted','Backend engineer, deep Postgres + subscriptions experience.', now()-interval '16 days', now()-interval '2 days','pending', now()-interval '2 days', now()+interval '5 days'),
  (apI, v_org, j_be, c9,'applied','Full-stack dev, open to a backend-leaning role.', now()-interval '5 days', now()-interval '5 days', NULL,NULL,NULL),
  (apJ, v_org, j_sm, c10,'interview_2','Built 200k+ follower communities for two grooming brands.', now()-interval '15 days', now()-interval '3 days', NULL,NULL,NULL),
  (apK, v_org, j_sm, c11,'applied','Social media exec with a strong reels portfolio.', now()-interval '4 days', now()-interval '4 days', NULL,NULL,NULL),
  (apL, v_org, j_cx, c12,'offer','5 yrs D2C support, NPS obsessed.', now()-interval '14 days', now()-interval '1 day', NULL,NULL,NULL),
  (apM, v_org, j_cx, c13,'screening','Customer support associate, fast learner.', now()-interval '7 days', now()-interval '3 days', NULL,NULL,NULL),
  (apN, v_org, j_cx, c14,'rejected','CX associate, retail background.', now()-interval '19 days', now()-interval '6 days', NULL,NULL,NULL);
  UPDATE applications SET rejection_reason='Strong profile but compensation expectations well above band for this role.' WHERE id=apC;
  UPDATE applications SET rejection_reason='Good communicator, but struggled with the written scenario exercise; not a fit for the volume.' WHERE id=apN;

  -- ===== INTERVIEW SCHEDULES =====
  INSERT INTO interview_schedules (id, org_id, application_id, interviewer_id, scheduled_at, duration_minutes, interview_type, meeting_link, notes, status, created_at) VALUES
  (isB, v_org, apB, v_priya, now()-interval '5 days', 45,'video','https://meet.google.com/man-pmm-rnd2','Channel strategy + ROAS deep dive.','completed', now()-interval '7 days'),
  (isE1, v_org, apE, v_aditi, now()-interval '8 days', 60,'video','https://meet.google.com/man-form-r1','Formulation fundamentals + emulsion stability.','completed', now()-interval '10 days'),
  (isE2, v_org, apE, v_rajesh, now()-interval '3 days', 60,'in_person','R&D Lab, Andheri','Final panel — bench problem + scale-up plan.','completed', now()-interval '4 days'),
  (isG, v_org, apG, v_tara, now()-interval '6 days', 60,'video','https://meet.google.com/man-be-r1','System design — subscriptions + inventory sync.','completed', now()-interval '8 days'),
  (isD, v_org, apD, v_rajesh, now()-interval '12 days', 60,'in_person','R&D Lab, Andheri','Leadership + portfolio review.','completed', now()-interval '14 days'),
  (isJ, v_org, apJ, v_aanya, now()+interval '3 days', 45,'in_person','The Man Project HQ, Andheri','Content sense + campaign case study.','scheduled', now()-interval '3 days'),
  (isN, v_org, apN, v_anjali, now()-interval '8 days', 30,'phone','Phone screen','CX scenarios + writing sample review.','completed', now()-interval '9 days');

  -- ===== INTERVIEW FEEDBACK =====
  INSERT INTO interview_feedback (id, org_id, schedule_id, interviewer_id, technical_rating, communication_rating, culture_fit_rating, overall_rating, recommendation, notes, submitted_at) VALUES
  (gen_random_uuid(), v_org, isB, v_priya, 4,5,4,4,'yes','Sharp on channel mix and creative testing. Slightly light on quick-commerce. Move to final.', now()-interval '4 days'),
  (gen_random_uuid(), v_org, isE1, v_aditi, 5,4,4,5,'strong_yes','Excellent grasp of emulsion stability and preservative systems. Clearly senior.', now()-interval '7 days'),
  (gen_random_uuid(), v_org, isE2, v_rajesh, 4,4,5,4,'yes','Solid bench problem-solving and a credible scale-up plan. Great culture fit.', now()-interval '3 days'),
  (gen_random_uuid(), v_org, isG, v_tara, 4,4,4,4,'yes','Good Node + Shopify depth. Designed the subscription sync cleanly. Recommend round 2.', now()-interval '5 days'),
  (gen_random_uuid(), v_org, isD, v_rajesh, 5,5,5,5,'strong_yes','Outstanding. Best formulator we have interviewed. Make the offer.', now()-interval '11 days'),
  (gen_random_uuid(), v_org, isN, v_anjali, 2,3,3,2,'no','Friendly but the written exercise had several errors. Not ready for our ticket volume.', now()-interval '8 days');

  -- ===== OFFERS =====
  INSERT INTO offers (id, org_id, application_id, ctc, joining_date, role_title, department_id, reporting_manager_id, additional_terms, status, offer_token, sent_at, responded_at, created_at) VALUES
  (gen_random_uuid(), v_org, apA, 1850000, (now()+interval '30 days')::date,'Performance Marketing Manager', d_perf, v_priya,'Includes performance bonus up to 15% of CTC tied to blended ROAS targets.','sent', gen_random_uuid(), now()-interval '2 days', NULL, now()-interval '2 days'),
  (gen_random_uuid(), v_org, apD, 1650000, (now()+interval '20 days')::date,'Senior Cosmetic Formulator', d_prod, v_rajesh,'Includes ESOPs vesting over 4 years and a relocation allowance.','accepted', gen_random_uuid(), now()-interval '8 days', now()-interval '5 days', now()-interval '8 days'),
  (gen_random_uuid(), v_org, apL, 650000, (now()+interval '15 days')::date,'Customer Experience Associate', d_cx, v_megha,'13th-month bonus on completion of one year.','accepted', gen_random_uuid(), now()-interval '3 days', now()-interval '1 day', now()-interval '3 days');

  -- ===== STAGE TRANSITIONS (per-application timeline) =====
  FOR rec IN
    SELECT * FROM (VALUES
      (apA, ARRAY['applied','screening','shortlisted','interview_1','interview_2','final_round','offer']::text[], v_priya),
      (apB, ARRAY['applied','screening','shortlisted','interview_1','interview_2']::text[], v_priya),
      (apC, ARRAY['applied','screening','rejected']::text[], v_priya),
      (apD, ARRAY['applied','screening','shortlisted','interview_1','interview_2','final_round','offer','hired']::text[], v_rajesh),
      (apE, ARRAY['applied','screening','shortlisted','interview_1','interview_2','final_round']::text[], v_rajesh),
      (apF, ARRAY['applied','screening']::text[], v_rajesh),
      (apG, ARRAY['applied','screening','shortlisted','interview_1']::text[], v_aryan),
      (apH, ARRAY['applied','screening','shortlisted']::text[], v_aryan),
      (apI, ARRAY['applied']::text[], v_aryan),
      (apJ, ARRAY['applied','screening','shortlisted','interview_1','interview_2']::text[], v_aanya),
      (apK, ARRAY['applied']::text[], v_aanya),
      (apL, ARRAY['applied','screening','shortlisted','interview_1','offer']::text[], v_megha),
      (apM, ARRAY['applied','screening']::text[], v_megha),
      (apN, ARRAY['applied','screening','shortlisted','interview_1','interview_2','rejected']::text[], v_megha)
    ) AS t(app_id, path, actor)
  LOOP
    FOR i IN 1..array_length(rec.path,1) LOOP
      INSERT INTO candidate_stage_transitions (org_id, application_id, from_stage, to_stage, direction, actor_id, actor_type, comment, side_effects_status, created_at)
      VALUES (
        v_org, rec.app_id,
        CASE WHEN i=1 THEN NULL ELSE rec.path[i-1] END,
        rec.path[i],
        CASE WHEN i=1 THEN 'initial' WHEN rec.path[i]='rejected' THEN 'reject' ELSE 'forward' END,
        CASE WHEN i=1 THEN NULL ELSE rec.actor END,
        CASE WHEN i=1 THEN 'system' ELSE 'admin' END,
        NULL, '{}'::jsonb,
        now()-interval '28 days' + ((i-1) * interval '3 days')
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'JambaHire demo seeded for The Man Project: 5 jobs, 14 candidates/apps (all 9 stages), 7 interviews, 6 feedback, 3 offers';
END $$;
