-- 085: ADMS user-provisioning command queue + employee PIN uniqueness

create sequence if not exists device_commands_cmd_seq;

create table if not exists device_commands (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  device_id     uuid not null references devices(id) on delete cascade,
  device_serial text not null,
  cmd_seq       bigint not null default nextval('device_commands_cmd_seq'),
  cmd_type      text not null check (cmd_type in ('upsert_user','delete_user')),
  pin           text not null,
  employee_id   uuid references employees(id) on delete set null,
  name          text,
  command_text  text,
  status        text not null default 'pending'
                check (status in ('pending','sent','confirmed','failed')),
  attempts      int not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  confirmed_at  timestamptz
);

create index if not exists idx_device_commands_serial_status
  on device_commands (device_serial, status);
create index if not exists idx_device_commands_org
  on device_commands (org_id);
create unique index if not exists uq_device_commands_pending
  on device_commands (device_id, pin, cmd_type)
  where status = 'pending';

alter table device_commands enable row level security;

-- Advisory policies (service-role bypasses; matches 083/084 Clerk-JWT pattern)
drop policy if exists device_commands_org_read on device_commands;
create policy device_commands_org_read on device_commands
  for select using (org_id::text = (auth.jwt() ->> 'org_id'));

drop policy if exists device_commands_admin_write on device_commands;
create policy device_commands_admin_write on device_commands
  for all using (
    org_id::text = (auth.jwt() ->> 'org_id')
    and (auth.jwt() ->> 'org_role') in ('org:owner','org:admin')
  );

-- One PIN per org so punch resolution is unambiguous
create unique index if not exists uq_employees_org_device_code
  on employees (org_id, device_code)
  where device_code is not null;
