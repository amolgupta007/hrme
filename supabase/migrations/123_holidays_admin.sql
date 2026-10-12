-- 123_holidays_admin.sql
-- Holidays become admin-managed (Settings → Holidays). Until now the only
-- writer was the new-org seed, so every existing row is marked 'seed'.
--   source:     where the row came from — seed | preset | manual | csv
--   created_by: the admin who added it (null for seeded rows)
--   updated_at: maintained by the shared update_updated_at_column() trigger
-- Additive and idempotent.

alter table public.holidays
  add column if not exists source text not null default 'seed',
  add column if not exists created_by uuid references public.employees(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows were backfilled to 'seed' by the add-column default above;
-- new rows default to 'manual'.
alter table public.holidays alter column source set default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'holidays_source_check') then
    alter table public.holidays
      add constraint holidays_source_check check (source in ('seed', 'preset', 'manual', 'csv'));
  end if;
end $$;

drop trigger if exists update_holidays_updated_at on public.holidays;
create trigger update_holidays_updated_at
  before update on public.holidays
  for each row execute function public.update_updated_at_column();
