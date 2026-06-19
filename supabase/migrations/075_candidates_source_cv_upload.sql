-- 075: allow 'cv_upload' as a candidates.source value (CV screening bulk upload).
alter table public.candidates drop constraint if exists candidates_source_check;
alter table public.candidates add constraint candidates_source_check
  check (source = any (array['direct','referral','linkedin','naukri','indeed','other','cv_upload']));
