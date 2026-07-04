-- 098_clause_library_seed.sql
-- Seed system-default offer-letter clauses (Indian SMB context). org_id/group_id
-- null + is_system_default = true → readable by every tenant. Idempotent: keyed
-- on (is_system_default, title). Every clause is editable/removable once pulled
-- into a template; these are starting points, not locked text.

insert into public.clause_library (org_id, group_id, title, body_markdown, category, is_system_default)
select null::uuid, null::uuid, v.title, v.body_markdown, v.category, true
from (values
  (
    'Position & Commencement',
    'You are appointed as **{{designation}}** at {{issuing_entity_name}} ({{employment_type}}). Your employment commences on **{{joining_date}}**. Your primary place of work will be as communicated by the Company and may change based on business requirements.',
    'custom'
  ),
  (
    'Compensation',
    'Your annual Cost to Company (CTC) is **{{ctc}}**, payable monthly and subject to statutory deductions including income tax (TDS). A detailed salary structure is provided separately and forms part of this offer.',
    'comp'
  ),
  (
    'Probation Period',
    'You will be on probation for a period of six (6) months from your date of joining. During probation, either party may terminate this employment by giving fifteen (15) days'' written notice. Confirmation of employment is subject to satisfactory performance.',
    'behavior'
  ),
  (
    'Notice Period',
    'After confirmation, either party may terminate this employment by giving sixty (60) days'' written notice or salary in lieu thereof. The Company reserves the right to relieve you earlier or to require you to serve the full notice period.',
    'behavior'
  ),
  (
    'Provident Fund & ESI',
    'You will be enrolled in the Employees'' Provident Fund (EPF) as per the Employees'' Provident Funds and Miscellaneous Provisions Act, 1952. Where applicable by wage thresholds, you will also be covered under the Employees'' State Insurance (ESI) Act, 1948. Statutory contributions will be deducted as per prevailing law.',
    'compliance'
  ),
  (
    'Working Hours & Leave',
    'Your working hours and holidays will be as per Company policy communicated from time to time. Your leave entitlement is governed by the Company''s leave policy and applicable law.',
    'behavior'
  ),
  (
    'Confidentiality',
    'During and after your employment, you shall keep confidential all proprietary, business, financial, and technical information of the Company and its clients, and shall not disclose or use such information except in the proper performance of your duties.',
    'confidentiality'
  ),
  (
    'Intellectual Property',
    'All work product, inventions, and intellectual property created by you in the course of your employment shall be the sole and exclusive property of the Company. You agree to execute any documents reasonably required to perfect the Company''s rights.',
    'confidentiality'
  ),
  (
    'Code of Conduct',
    'You are expected to conduct yourself professionally and to comply with all Company policies, including those on anti-harassment (POSH Act, 2013), data protection, and workplace ethics. Breach of the code of conduct may result in disciplinary action up to termination.',
    'behavior'
  ),
  (
    'Non-Solicitation',
    'For a period of twelve (12) months following the cessation of your employment, you shall not solicit or attempt to solicit any employee or client of the Company for a competing purpose.',
    'confidentiality'
  ),
  (
    'Governing Law',
    'This offer and your employment shall be governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts having jurisdiction over the Company''s registered office.',
    'compliance'
  )
) as v(title, body_markdown, category)
where not exists (
  select 1 from public.clause_library c
  where c.is_system_default = true and c.title = v.title
);
