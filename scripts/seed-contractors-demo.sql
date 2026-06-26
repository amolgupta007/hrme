-- ============================================================================
-- Contractor demo seed — PlayPause Studios (org slug "test1")
-- Creative firm managing creators & artists. Showcases the Contractors module:
--   - 6 creative-talent contractors (employment_type = 'contract')
--   - engagements hitting every TDS branch (194J 10%, 194C 1% & 2%, no-PAN 20%)
--   - agreements in every state (signed service, signed IP, pending NDA, declined IP)
--   - verified bank beneficiaries (so the live "Pay contractors" flow works)
--   - one COMPLETED payout batch (illustrative history, maker-checker approved)
--
-- Idempotent: re-running deletes the seeded rows (by fixed UUID) and re-inserts.
-- Numbers match src/lib/contractor/tds.ts exactly (FY 2025-26).
-- Org id: 851a0785-a98e-45b7-8bc9-9940c157ba9f
-- ============================================================================

BEGIN;

-- 0) Rename the org + add a "Creators & Talent" department for the roster --------
UPDATE organizations
SET name = 'PlayPause Studios'
WHERE id = '851a0785-a98e-45b7-8bc9-9940c157ba9f';

INSERT INTO departments (id, org_id, name)
VALUES ('d2c00001-0000-0000-0000-0000000000c0', '851a0785-a98e-45b7-8bc9-9940c157ba9f', 'Creators & Talent')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Re-theme the existing departments to read as a creative studio (name-only; IDs +
-- employee assignments preserved). Finance & HR is kept as-is.
UPDATE departments SET name='Talent Management'          WHERE id='d2c00001-0000-0000-0000-000000000005';
UPDATE departments SET name='Legal & Rights'             WHERE id='d2c00001-0000-0000-0000-000000000006';
UPDATE departments SET name='Marketing & Brand'          WHERE id='d2c00001-0000-0000-0000-000000000001';
UPDATE departments SET name='Content Production'         WHERE id='d2c00001-0000-0000-0000-000000000003';
UPDATE departments SET name='Studio Operations'          WHERE id='d2c00001-0000-0000-0000-000000000004';
UPDATE departments SET name='Partnerships & Brand Deals' WHERE id='d2c00001-0000-0000-0000-000000000002';

-- Demo owner account display name (test1-scoped).
UPDATE employees SET first_name='Harry', last_name=''
WHERE org_id='851a0785-a98e-45b7-8bc9-9940c157ba9f' AND lower(email)='amolgupta007@gmail.com';

-- 1) Clean up prior seed (FK-safe order) ---------------------------------------
DELETE FROM disbursement_items  WHERE id IN (
  'c0000006-0000-0000-0000-000000000001',
  'c0000006-0000-0000-0000-000000000002',
  'c0000006-0000-0000-0000-000000000003');
DELETE FROM disbursement_batches WHERE id = 'c0000005-0000-0000-0000-000000000001';
DELETE FROM contractor_agreements WHERE contractor_engagement_id IN (
  SELECT id FROM contractor_engagements WHERE employee_id IN (
    'c0000001-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000002',
    'c0000001-0000-0000-0000-000000000003','c0000001-0000-0000-0000-000000000004',
    'c0000001-0000-0000-0000-000000000005','c0000001-0000-0000-0000-000000000006'));
DELETE FROM contractor_engagements WHERE employee_id IN (
  'c0000001-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000002',
  'c0000001-0000-0000-0000-000000000003','c0000001-0000-0000-0000-000000000004',
  'c0000001-0000-0000-0000-000000000005','c0000001-0000-0000-0000-000000000006');
DELETE FROM employee_bank_accounts WHERE employee_id IN (
  'c0000001-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000002',
  'c0000001-0000-0000-0000-000000000003','c0000001-0000-0000-0000-000000000004',
  'c0000001-0000-0000-0000-000000000005','c0000001-0000-0000-0000-000000000006');
DELETE FROM employees WHERE id IN (
  'c0000001-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000002',
  'c0000001-0000-0000-0000-000000000003','c0000001-0000-0000-0000-000000000004',
  'c0000001-0000-0000-0000-000000000005','c0000001-0000-0000-0000-000000000006');

-- 2) Contractor employees (role stays 'employee'; employment_type drives everything) --
INSERT INTO employees (id, org_id, first_name, last_name, email, role, employment_type, status, department_id, date_of_joining)
VALUES
 ('c0000001-0000-0000-0000-000000000001','851a0785-a98e-45b7-8bc9-9940c157ba9f','Aarav','Kapoor','aarav.kapoor.demo@playpause.studio','employee','contract','active','d2c00001-0000-0000-0000-0000000000c0','2026-01-15'),
 ('c0000001-0000-0000-0000-000000000002','851a0785-a98e-45b7-8bc9-9940c157ba9f','Zoya','Sheikh','zoya.sheikh.demo@playpause.studio','employee','contract','active','d2c00001-0000-0000-0000-0000000000c0','2026-02-01'),
 ('c0000001-0000-0000-0000-000000000003','851a0785-a98e-45b7-8bc9-9940c157ba9f','Dev','Malhotra','dev.malhotra.demo@playpause.studio','employee','contract','active','d2c00001-0000-0000-0000-0000000000c0','2026-03-10'),
 ('c0000001-0000-0000-0000-000000000004','851a0785-a98e-45b7-8bc9-9940c157ba9f','FrameForge','Studios','accounts.demo@frameforge.studio','employee','contract','active','d2c00001-0000-0000-0000-0000000000c0','2026-02-20'),
 ('c0000001-0000-0000-0000-000000000005','851a0785-a98e-45b7-8bc9-9940c157ba9f','Meera','Joshi','meera.joshi.demo@playpause.studio','employee','contract','active','d2c00001-0000-0000-0000-0000000000c0','2026-04-05'),
 ('c0000001-0000-0000-0000-000000000006','851a0785-a98e-45b7-8bc9-9940c157ba9f','Kabir','Sen','kabir.sen.demo@playpause.studio','employee','contract','active','d2c00001-0000-0000-0000-0000000000c0','2026-04-22');

-- 3) Engagements (one active per contractor) -----------------------------------
INSERT INTO contractor_engagements
  (id, org_id, employee_id, rate_type, rate_amount, tds_section, payee_type, has_pan, contract_start, contract_end, renewal_date, status)
VALUES
 ('c0000002-0000-0000-0000-000000000001','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000001','monthly',  120000,'194J','individual_huf',true, '2026-01-15',NULL,'2026-12-31','active'),
 ('c0000002-0000-0000-0000-000000000002','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000002','monthly',   80000,'194J','individual_huf',true, '2026-02-01',NULL,'2026-12-31','active'),
 ('c0000002-0000-0000-0000-000000000003','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000003','milestone', 60000,'194J','individual_huf',true, '2026-03-10',NULL,NULL,'active'),
 ('c0000002-0000-0000-0000-000000000004','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000004','milestone',600000,'194C','other',         true, '2026-02-20',NULL,NULL,'active'),
 ('c0000002-0000-0000-0000-000000000005','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000005','daily',     15000,'194C','individual_huf',true, '2026-04-05',NULL,NULL,'active'),
 ('c0000002-0000-0000-0000-000000000006','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000006','milestone', 90000,'194J','individual_huf',false,'2026-04-22',NULL,NULL,'active');

-- 4) Verified bank beneficiaries (placeholder ciphertext; UI shows last4 only) ---
--    beneficiary_sync_status = 'synced' so the live "Pay contractors" flow includes them.
INSERT INTO employee_bank_accounts
  (id, org_id, employee_id, holder_name, account_number_encrypted, account_number_last4, account_number_hash,
   ifsc_encrypted, ifsc_first4, account_type, razorpayx_contact_id, razorpayx_fund_account_id, beneficiary_sync_status, beneficiary_synced_at)
VALUES
 ('c0000003-0000-0000-0000-000000000001','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000001','Aarav Kapoor','demo-enc:aarav','4471','demo-hash-aarav','demo-enc:hdfc','HDFC','savings','cont_DEMOAARAV','fa_DEMOAARAV','synced','2026-05-20 06:30:00+00'),
 ('c0000003-0000-0000-0000-000000000002','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000002','Zoya Sheikh','demo-enc:zoya','8820','demo-hash-zoya','demo-enc:icic','ICIC','savings','cont_DEMOZOYA','fa_DEMOZOYA','synced','2026-05-20 06:31:00+00'),
 ('c0000003-0000-0000-0000-000000000003','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000003','Dev Malhotra','demo-enc:dev','1290','demo-hash-dev','demo-enc:sbin','SBIN','savings','cont_DEMODEV','fa_DEMODEV','synced','2026-05-21 06:30:00+00'),
 ('c0000003-0000-0000-0000-000000000004','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000004','FrameForge Studios Pvt Ltd','demo-enc:frameforge','5567','demo-hash-frameforge','demo-enc:utib','UTIB','current','cont_DEMOFRAME','fa_DEMOFRAME','synced','2026-05-20 06:32:00+00'),
 ('c0000003-0000-0000-0000-000000000005','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000005','Meera Joshi','demo-enc:meera','3344','demo-hash-meera','demo-enc:kkbk','KKBK','savings','cont_DEMOMEERA','fa_DEMOMEERA','synced','2026-05-22 06:30:00+00'),
 ('c0000003-0000-0000-0000-000000000006','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000001-0000-0000-0000-000000000006','Kabir Sen','demo-enc:kabir','9981','demo-hash-kabir','demo-enc:pytm','PYTM','savings','cont_DEMOKABIR','fa_DEMOKABIR','synced','2026-05-22 06:31:00+00');

-- 5) Agreements (every state) --------------------------------------------------
INSERT INTO contractor_agreements
  (id, org_id, contractor_engagement_id, agreement_type, ip_ownership, title, body_text, version, agreement_token, status, sent_at, signed_at, signed_by_name, ip_address, user_agent, expires_at)
VALUES
 -- Aarav: Service, licensed (creator owns his sets, grants PlayPause a licence) — SIGNED
 ('c0000004-0000-0000-0000-000000000001','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000002-0000-0000-0000-000000000001','service','licensed',
  'Service Agreement — Aarav Kapoor (Stand-up Comedian)',
  'This Service Agreement is between PlayPause Studios and Aarav Kapoor for stand-up comedy content. IP ownership: the Creator retains ownership of original comedic material and grants PlayPause Studios a non-exclusive licence to record, distribute, and promote the engaged performances.',
  1,'ppstudios-demo-agr-aarav-service','signed','2026-01-16 05:30:00+00','2026-01-16 09:12:44+00','Aarav Kapoor','103.21.58.10','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',NULL),
 -- Zoya: IP assignment, work-for-hire (studio owns the edits) — SIGNED
 ('c0000004-0000-0000-0000-000000000002','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000002-0000-0000-0000-000000000002','ip_assignment','work_for_hire',
  'IP Assignment — Zoya Sheikh (Video Editor)',
  'All edited footage, project files, and derivative works produced under this engagement are created as work-for-hire and the entire right, title, and interest vest in PlayPause Studios upon creation.',
  1,'ppstudios-demo-agr-zoya-ip','signed','2026-02-02 05:30:00+00','2026-02-02 11:48:03+00','Zoya Sheikh','49.36.220.7','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',NULL),
 -- Dev: NDA — SENT (pending). Token is live-demoable at /agreements/<token>
 ('c0000004-0000-0000-0000-000000000003','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000002-0000-0000-0000-000000000003','nda','na',
  'Non-Disclosure Agreement — Dev Malhotra (Graphic Designer)',
  'Dev Malhotra agrees to keep confidential all unreleased campaigns, brand assets, and creator information disclosed by PlayPause Studios during the engagement.',
  1,'ppstudios-demo-nda-dev','sent','2026-06-22 05:30:00+00',NULL,NULL,NULL,NULL,'2026-07-22 05:30:00+00'),
 -- FrameForge: Service, work-for-hire — SIGNED (company)
 ('c0000004-0000-0000-0000-000000000004','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000002-0000-0000-0000-000000000004','service','work_for_hire',
  'Service Agreement — FrameForge Studios Pvt Ltd (Production)',
  'FrameForge Studios Pvt Ltd will deliver produced video content. All deliverables are work-for-hire; full IP vests in PlayPause Studios on delivery and payment.',
  1,'ppstudios-demo-agr-frameforge-service','signed','2026-02-21 05:30:00+00','2026-02-21 07:20:10+00','Rohit Saxena (FrameForge Studios Pvt Ltd)','110.226.180.45','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',NULL),
 -- Meera: Service, na — SIGNED
 ('c0000004-0000-0000-0000-000000000005','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000002-0000-0000-0000-000000000005','service','na',
  'Service Agreement — Meera Joshi (Videographer)',
  'Meera Joshi will provide on-location videography services on a per-day basis for PlayPause Studios shoots as scheduled.',
  1,'ppstudios-demo-agr-meera-service','signed','2026-04-06 05:30:00+00','2026-04-06 10:05:51+00','Meera Joshi','157.49.12.88','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',NULL),
 -- Kabir: IP assignment, licensed — DECLINED
 ('c0000004-0000-0000-0000-000000000006','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000002-0000-0000-0000-000000000006','ip_assignment','licensed',
  'IP Assignment — Kabir Sen (Music Producer)',
  'Proposed assignment of master rights for original tracks produced for PlayPause Studios, with a performance licence retained by the Producer.',
  1,'ppstudios-demo-agr-kabir-ip','declined','2026-05-01 05:30:00+00',NULL,NULL,NULL,NULL,NULL);

-- 6) One COMPLETED payout batch (illustrative history) -------------------------
--    Paid Aarav (net 108000) + Zoya (net 72000) + FrameForge (net 588000) = 768000.
--    Maker = Aanya Khanna (admin), Checker = Priya Rao (admin)  -> maker-checker.
INSERT INTO disbursement_batches
  (id, org_id, payroll_run_id, kind, status, total_amount, total_fees_paise, override_wallet_shortfall,
   idempotency_key, maker_id, initiated_at, checker_id, approved_at, completed_at)
VALUES
 ('c0000005-0000-0000-0000-000000000001','851a0785-a98e-45b7-8bc9-9940c157ba9f',NULL,'contractor','completed',768000,0,false,
  'demo-contractor-batch-2026-05','e2c00001-0000-0000-0000-000000000002','2026-05-28 06:30:00+00','e2c00001-0000-0000-0000-000000000007','2026-05-28 07:15:00+00','2026-05-28 07:16:30+00');

INSERT INTO disbursement_items
  (id, org_id, batch_id, payroll_entry_id, contractor_engagement_id, employee_id, fund_account_id, amount, fee_paise, status, razorpayx_payout_id, retry_count, paid_at)
VALUES
 ('c0000006-0000-0000-0000-000000000001','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000005-0000-0000-0000-000000000001',NULL,'c0000002-0000-0000-0000-000000000001','c0000001-0000-0000-0000-000000000001','fa_DEMOAARAV',108000,531,'paid','pout_DEMOAARAV01',0,'2026-05-28 07:16:00+00'),
 ('c0000006-0000-0000-0000-000000000002','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000005-0000-0000-0000-000000000001',NULL,'c0000002-0000-0000-0000-000000000002','c0000001-0000-0000-0000-000000000002','fa_DEMOZOYA',72000,531,'paid','pout_DEMOZOYA01',0,'2026-05-28 07:16:10+00'),
 ('c0000006-0000-0000-0000-000000000003','851a0785-a98e-45b7-8bc9-9940c157ba9f','c0000005-0000-0000-0000-000000000001',NULL,'c0000002-0000-0000-0000-000000000004','c0000001-0000-0000-0000-000000000004','fa_DEMOFRAME',588000,531,'paid','pout_DEMOFRAME01',0,'2026-05-28 07:16:20+00');

COMMIT;
