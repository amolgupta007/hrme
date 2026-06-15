-- ============================================================
-- JAMBAGEO DEMO SEED — The Man Project (D2C men's grooming brand)
-- Run in: Supabase Dashboard → SQL Editor
-- Scenario: offline retail / channel expansion (salons, pharmacies,
--           modern trade, gyms, distributors).
-- Seeds: 5 geofences (HQ + fulfilment centre + 3 partner sites),
--        12 leads across ALL 6 stages (geocoded so map pins render,
--        assigned to field reps + 1 unassigned), 4 logged visits.
-- Idempotent: re-running is a no-op once any lead/geofence exists.
-- Employees are resolved dynamically by designation, so this is portable.
-- ============================================================

DO $$
DECLARE
  v_org uuid; v_owner uuid;
  v_arjun uuid; v_riya uuid; v_divya uuid; v_amit uuid;
BEGIN
  SELECT o.id INTO v_org FROM organizations o WHERE o.name ILIKE '%man project%' LIMIT 1;
  IF v_org IS NULL THEN RAISE EXCEPTION 'The Man Project org not found'; END IF;

  IF EXISTS (SELECT 1 FROM leads WHERE org_id=v_org) OR EXISTS (SELECT 1 FROM geofences WHERE org_id=v_org) THEN
    RAISE NOTICE 'JambaGeo demo already seeded; skipping'; RETURN;
  END IF;

  SELECT e.id INTO v_owner FROM employees e WHERE e.org_id=v_org AND e.role='owner' LIMIT 1;
  SELECT e.id INTO v_arjun FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Performance Marketing Lead' LIMIT 1;
  SELECT e.id INTO v_riya  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Retention & CRM Lead' LIMIT 1;
  SELECT e.id INTO v_divya FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Procurement Lead' LIMIT 1;
  SELECT e.id INTO v_amit  FROM employees e WHERE e.org_id=v_org AND e.designation ILIKE 'Logistics Coordinator' LIMIT 1;

  -- ===== GEOFENCES (HQ + FC + 3 partner sites) =====
  INSERT INTO geofences (org_id, name, type, center_lat, center_lng, radius_m, notes, created_by) VALUES
  (v_org, 'The Man Project HQ — Andheri', 'office', 19.1136, 72.8697, 300, 'Head office & studio', v_owner),
  (v_org, 'Bhiwandi Fulfilment Centre', 'office', 19.2967, 73.0631, 500, 'Primary warehouse & dispatch', v_owner),
  (v_org, 'Truefitt Salon — Bandra', 'client', 19.0596, 72.8295, 200, 'Premium salon channel partner', v_owner),
  (v_org, 'Wellness Forever — Pune FC Road', 'client', 18.5236, 73.8413, 300, 'Pharmacy modern-trade partner', v_owner),
  (v_org, 'Health & Glow — Indiranagar Bengaluru', 'client', 12.9719, 77.6412, 300, 'Beauty & grooming retail chain', v_owner);

  -- ===== LEADS (12 across all 6 stages, geocoded) =====
  INSERT INTO leads (org_id, name, contact_phone, contact_email, company, address, lat, lng, assigned_to, stage, value_inr, source, created_by, created_at) VALUES
  (v_org,'Sharath Menon','+91 98201 50001','sharath@truefittsalons.in','Truefitt & Hill Salons','Linking Road, Bandra West, Mumbai',19.0606,72.8362, v_arjun,'contacted', 850000,'Trade show', v_owner, now()-interval '26 days'),
  (v_org,'Deepa Nair','+91 98201 50002','deepa.nair@wellnessforever.in','Wellness Forever Pharmacy','FC Road, Pune',18.5236,73.8413, v_divya,'negotiation', 2200000,'Inbound', v_owner, now()-interval '24 days'),
  (v_org,'Rakesh Khanna','+91 98201 50003','rakesh@healthandglow.com','Health & Glow Retail','Indiranagar, Bengaluru',12.9719,77.6412, v_arjun,'new', 1800000,'LinkedIn', v_owner, now()-interval '6 days'),
  (v_org,'Vinod Shetty','+91 98201 50004','vinod@naturalssalon.in','Naturals Salon Chain','Powai, Mumbai',19.1176,72.9060, v_riya,'visited', 1200000,'Referral', v_owner, now()-interval '18 days'),
  (v_org,'Pradeep Rao','+91 98201 50005','pradeep.rao@apollopharma.in','Apollo Pharmacy (West Zone)','Banjara Hills, Hyderabad',17.4126,78.4360, v_divya,'contacted', 3500000,'Trade show', v_owner, now()-interval '15 days'),
  (v_org,'Sunita Agarwal','+91 98201 50006','sunita@lookssalon.in','Looks Salon','Connaught Place, New Delhi',28.6315,77.2167, v_riya,'converted', 1500000,'Referral', v_owner, now()-interval '30 days'),
  (v_org,'Manoj Pillai','+91 98201 50007','manoj.pillai@cult.fit','Cult.fit Retail Corners','Koramangala, Bengaluru',12.9352,77.6245, v_arjun,'negotiation', 2800000,'Inbound', v_owner, now()-interval '20 days'),
  (v_org,'Karthik Reddy','+91 98201 50008','karthik@starbazaar.in','Star Bazaar Modern Trade','Lower Parel, Mumbai',18.9980,72.8300, v_amit,'new', 4200000,'Cold call', v_owner, now()-interval '4 days'),
  (v_org,'Bhavna Joshi','+91 98201 50009','bhavna@enrichsalons.in','Enrich Salons','Aundh, Pune',18.5590,73.8070, v_riya,'visited', 950000,'Walk-in', v_owner, now()-interval '12 days'),
  (v_org,'Aslam Khan','+91 98201 50010','aslam@westzonedist.in','West Zone Distributors','Kurla, Mumbai',19.0726,72.8845, v_divya,'lost', 700000,'Cold call', v_owner, now()-interval '22 days'),
  (v_org,'Geeta Krishnan','+91 98201 50011','geeta@nykaa.com','Nykaa Offline Store','Phoenix Marketcity, Kurla, Mumbai',19.0869,72.8889, v_arjun,'contacted', 2600000,'Inbound', v_owner, now()-interval '9 days'),
  (v_org,'Ramesh Gupta','+91 98201 50012',NULL,'Mens Grooming Kiosk','Phoenix Mall, Lower Parel, Mumbai',18.9942,72.8268, NULL,'new', 600000,'Walk-in', v_owner, now()-interval '3 days');

  -- ===== LEAD VISITS (human-logged, system=false) =====
  INSERT INTO lead_visits (lead_id, org_id, employee_id, lat, lng, notes, outcome, source, system, visited_at, follow_up_date)
  SELECT l.id, v_org, v_riya, 19.1176,72.9060,'Demoed the full grooming range to 3 Naturals outlets. Area manager keen; wants a margin sheet and a pricing proposal.','follow_up','web',false, now()-interval '5 days', (current_date + 3)
  FROM leads l WHERE l.org_id=v_org AND l.name='Vinod Shetty';

  INSERT INTO lead_visits (lead_id, org_id, employee_id, lat, lng, notes, outcome, source, system, visited_at)
  SELECT l.id, v_org, v_riya, 18.5590,73.8070,'Sampling drive at 2 Enrich outlets. Strong walk-in response on the beard range.','pending','web',false, now()-interval '4 days'
  FROM leads l WHERE l.org_id=v_org AND l.name='Bhavna Joshi';

  INSERT INTO lead_visits (lead_id, org_id, employee_id, lat, lng, notes, outcome, source, system, visited_at)
  SELECT l.id, v_org, v_riya, 28.6315,77.2167,'Signed channel agreement for 6 Looks Salon outlets across Delhi NCR. First PO confirmed.','converted','web',false, now()-interval '8 days'
  FROM leads l WHERE l.org_id=v_org AND l.name='Sunita Agarwal';

  INSERT INTO lead_visits (lead_id, org_id, employee_id, lat, lng, notes, outcome, source, system, visited_at)
  SELECT l.id, v_org, v_divya, 19.0726,72.8845,'Distributor wants exclusive margins well beyond our channel policy. Walked away.','lost','web',false, now()-interval '10 days'
  FROM leads l WHERE l.org_id=v_org AND l.name='Aslam Khan';

  RAISE NOTICE 'JambaGeo demo seeded for The Man Project: 5 geofences, 12 leads (all 6 stages), 4 visits';
END $$;
