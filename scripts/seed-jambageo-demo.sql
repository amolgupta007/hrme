-- scripts/seed-jambageo-demo.sql
-- Demo data for the test1 org. Idempotent via natural-key ON CONFLICT.

DO $$
DECLARE
  v_org uuid;
  v_sales_emp uuid;
  v_mkt_emp uuid;
BEGIN
  SELECT id INTO v_org FROM organizations
    WHERE clerk_org_id LIKE '%test1%' OR name ILIKE '%test1%' LIMIT 1;
  IF v_org IS NULL THEN
    RAISE NOTICE 'test1 org not found; skipping seed';
    RETURN;
  END IF;

  -- Pick first active employee in Sales and Marketing (used as assignees)
  SELECT e.id INTO v_sales_emp FROM employees e
    JOIN departments d ON d.id = e.department_id
    WHERE e.org_id = v_org AND d.name ILIKE '%sales%' AND e.status = 'active'
    LIMIT 1;
  SELECT e.id INTO v_mkt_emp FROM employees e
    JOIN departments d ON d.id = e.department_id
    WHERE e.org_id = v_org AND d.name ILIKE '%marketing%' AND e.status = 'active'
    LIMIT 1;

  -- 4 geofences: Mumbai office + 3 client sites
  INSERT INTO geofences (org_id, name, type, center_lat, center_lng, radius_m)
  VALUES
    (v_org, 'Mumbai HQ (Andheri)', 'office', 19.1197, 72.8466, 300),
    (v_org, 'Acme Industries - Pune', 'client', 18.5204, 73.8567, 500),
    (v_org, 'Beta Logistics - Bandra', 'client', 19.0596, 72.8295, 250),
    (v_org, 'Gamma Tech - Connaught Place Delhi', 'client', 28.6315, 77.2167, 400)
  ON CONFLICT DO NOTHING;

  -- 12 leads across 6 stages
  INSERT INTO leads (org_id, name, contact_phone, company, address, assigned_to, stage, value_inr, source)
  VALUES
    (v_org, 'Rajesh Kumar', '+91 98765 43210', 'Acme Industries', 'Pune MIDC', v_sales_emp, 'new', 250000, 'Website'),
    (v_org, 'Anita Sharma', '+91 99887 76655', 'Beta Logistics', 'Bandra West Mumbai', v_sales_emp, 'new', 180000, 'Referral'),
    (v_org, 'Priya Patel', '+91 98765 11122', 'Delta Foods', 'Andheri East Mumbai', v_mkt_emp, 'contacted', 450000, 'LinkedIn'),
    (v_org, 'Sunil Verma', '+91 97654 33221', 'Epsilon Retail', 'Connaught Place Delhi', v_sales_emp, 'contacted', 320000, 'Walk-in'),
    (v_org, 'Meera Iyer', '+91 99887 99887', 'Zeta Pharma', 'Powai Mumbai', v_mkt_emp, 'contacted', 600000, 'Trade show'),
    (v_org, 'Karan Singh', '+91 98123 45678', 'Eta Construction', 'Worli Mumbai', v_sales_emp, 'visited', 950000, 'Cold call'),
    (v_org, 'Divya Nair', '+91 99887 12345', 'Theta Hospitality', 'Bandra Mumbai', v_mkt_emp, 'visited', 280000, 'Referral'),
    (v_org, 'Arun Joshi', '+91 98765 99887', 'Iota Education', 'Andheri Mumbai', v_sales_emp, 'visited', 410000, 'Website'),
    (v_org, 'Kavya Reddy', '+91 99887 33344', 'Kappa Healthcare', 'Lower Parel Mumbai', v_sales_emp, 'negotiation', 1500000, 'Inbound'),
    (v_org, 'Sanjay Mehta', '+91 98765 22211', 'Lambda Manufacturing', 'Pune Hinjewadi', v_mkt_emp, 'converted', 720000, 'Referral'),
    (v_org, 'Pooja Bhatt', '+91 99887 22233', 'Mu Solutions', 'Vashi Navi Mumbai', v_sales_emp, 'lost', 350000, 'Cold call'),
    (v_org, 'Vikram Rao', '+91 98765 00011', 'Nu Ventures', 'Malad Mumbai', NULL, 'new', NULL, 'Walk-in')  -- unassigned
  ON CONFLICT DO NOTHING;

  -- Sample visits on a few leads
  -- (visit-create requires a non-null employee_id — use v_sales_emp)
  INSERT INTO lead_visits (lead_id, org_id, employee_id, notes, outcome, source, system, visited_at)
  SELECT l.id, v_org, v_sales_emp,
    'Initial call. Decision-maker available next week.', 'pending', 'web', false, now() - interval '3 days'
  FROM leads l WHERE l.org_id = v_org AND l.name = 'Priya Patel' LIMIT 1
  ON CONFLICT DO NOTHING;

  INSERT INTO lead_visits (lead_id, org_id, employee_id, notes, outcome, source, system, visited_at, follow_up_date)
  SELECT l.id, v_org, v_sales_emp,
    'Met procurement head. They want a detailed proposal by Friday.', 'follow_up', 'web', false, now() - interval '2 days',
    (current_date - 1)
  FROM leads l WHERE l.org_id = v_org AND l.name = 'Karan Singh' LIMIT 1
  ON CONFLICT DO NOTHING;
END $$;
