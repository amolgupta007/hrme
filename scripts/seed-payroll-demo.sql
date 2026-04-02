-- ============================================================
-- PAYROLL DEMO SEED — test1 org
-- Run in: Supabase Dashboard → SQL Editor
-- Seeds salary structures for all 15 test1 employees
-- ============================================================

DO $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id FROM organizations WHERE slug = 'test1' LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'test1 org not found';
  END IF;

  -- Insert salary structures for all active employees
  -- Using INSERT ... ON CONFLICT DO UPDATE so re-running is safe
  INSERT INTO salary_structures (org_id, employee_id, ctc, basic_monthly, hra_monthly, special_allowance_monthly, gross_monthly, employee_pf_monthly, employer_pf_monthly, employer_gratuity_annual, professional_tax_monthly, tds_monthly, net_monthly, state, is_metro, include_hra, effective_from)
  SELECT
    v_org_id,
    e.id,
    -- CTC varies by role
    CASE e.role
      WHEN 'owner'   THEN 3600000   -- 36 LPA
      WHEN 'admin'   THEN 2400000   -- 24 LPA
      WHEN 'manager' THEN 1800000   -- 18 LPA
      ELSE                1200000   -- 12 LPA (employees)
    END AS ctc,
    -- Basic = 40% of CTC / 12
    CASE e.role
      WHEN 'owner'   THEN 120000
      WHEN 'admin'   THEN 80000
      WHEN 'manager' THEN 60000
      ELSE                40000
    END AS basic_monthly,
    -- HRA = 50% of basic (metro)
    CASE e.role
      WHEN 'owner'   THEN 60000
      WHEN 'admin'   THEN 40000
      WHEN 'manager' THEN 30000
      ELSE                20000
    END AS hra_monthly,
    -- Special allowance = remaining
    CASE e.role
      WHEN 'owner'   THEN 115200
      WHEN 'admin'   THEN 76800
      WHEN 'manager' THEN 57600
      ELSE                38400
    END AS special_allowance_monthly,
    -- Gross = basic + hra + special
    CASE e.role
      WHEN 'owner'   THEN 295200
      WHEN 'admin'   THEN 196800
      WHEN 'manager' THEN 147600
      ELSE                98400
    END AS gross_monthly,
    -- Employee PF = 12% of basic (capped at 1800)
    1800 AS employee_pf_monthly,
    -- Employer PF = 3.67% of basic (capped at ~1100)
    1100 AS employer_pf_monthly,
    -- Employer gratuity annual = 4.81% of basic annual
    CASE e.role
      WHEN 'owner'   THEN 69264   -- 4.81% of 1440000
      WHEN 'admin'   THEN 46176   -- 4.81% of 960000
      WHEN 'manager' THEN 34632   -- 4.81% of 720000
      ELSE                23088   -- 4.81% of 480000
    END AS employer_gratuity_annual,
    -- Professional Tax (Maharashtra, metro)
    200 AS professional_tax_monthly,
    -- TDS (approximate monthly, new regime)
    CASE e.role
      WHEN 'owner'   THEN 42000
      WHEN 'admin'   THEN 20000
      WHEN 'manager' THEN 10000
      ELSE                3000
    END AS tds_monthly,
    -- Net = gross - pf - pt - tds
    CASE e.role
      WHEN 'owner'   THEN 251200   -- 295200 - 1800 - 200 - 42000
      WHEN 'admin'   THEN 174800   -- 196800 - 1800 - 200 - 20000
      WHEN 'manager' THEN 135600   -- 147600 - 1800 - 200 - 10000
      ELSE                93400    -- 98400 - 1800 - 200 - 3000
    END AS net_monthly,
    'maharashtra' AS state,
    true AS is_metro,
    true AS include_hra,
    '2026-01-01' AS effective_from
  FROM employees e
  WHERE e.org_id = v_org_id
    AND e.status = 'active'
  ON CONFLICT (org_id, employee_id) DO UPDATE SET
    ctc = EXCLUDED.ctc,
    basic_monthly = EXCLUDED.basic_monthly,
    hra_monthly = EXCLUDED.hra_monthly,
    special_allowance_monthly = EXCLUDED.special_allowance_monthly,
    gross_monthly = EXCLUDED.gross_monthly,
    employee_pf_monthly = EXCLUDED.employee_pf_monthly,
    professional_tax_monthly = EXCLUDED.professional_tax_monthly,
    tds_monthly = EXCLUDED.tds_monthly,
    net_monthly = EXCLUDED.net_monthly,
    effective_from = EXCLUDED.effective_from;

  RAISE NOTICE 'Salary structures seeded for org: %', v_org_id;
END $$;
