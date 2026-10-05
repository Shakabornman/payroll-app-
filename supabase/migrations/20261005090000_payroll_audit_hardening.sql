-- Payroll audit trail hardening.
-- Only payroll_admin can read or add entries. Entries are append-only for
-- app and API roles; the Supabase owner keeps full rights. Actor and time come
-- from the signed-in token. Every change to payroll data is logged by the
-- database, with banking and ID-number values redacted in the log.

begin;

alter table payroll.audit_log          enable row level security;
alter table payroll.audit_log_archive  enable row level security;

drop policy if exists audit_log_insert     on payroll.audit_log;
drop policy if exists audit_log_select     on payroll.audit_log;
drop policy if exists audit_archive_select on payroll.audit_log_archive;

create policy audit_log_select on payroll.audit_log
  for select to authenticated
  using (shared.has_access_level('payroll_admin'));

create policy audit_log_insert on payroll.audit_log
  for insert to authenticated
  with check (shared.has_access_level('payroll_admin'));

create policy audit_archive_select on payroll.audit_log_archive
  for select to authenticated
  using (shared.has_access_level('payroll_admin'));

create or replace function payroll.audit_log_stamp()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
begin
  NEW.occurred_at := now();
  NEW.actor_uid   := coalesce(claims->>'sub', 'system');
  NEW.actor_email := coalesce(claims->>'email', 'system');
  return NEW;
end;
$$;

drop trigger if exists audit_log_stamp on payroll.audit_log;
create trigger audit_log_stamp
  before insert on payroll.audit_log
  for each row execute function payroll.audit_log_stamp();

revoke update, delete, truncate on payroll.audit_log from authenticated;
revoke update, delete, truncate on payroll.audit_log_archive from authenticated;

create or replace function payroll.audit_log_block_changes()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon', 'payroll_service') then
    raise exception 'payroll.audit_log is append-only';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_log_block_changes on payroll.audit_log;
create trigger audit_log_block_changes
  before update or delete on payroll.audit_log
  for each row execute function payroll.audit_log_block_changes();

create or replace function payroll.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  old_j jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  new_j jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  diff  jsonb := '{}'::jsonb;
  k     text;
  sensitive boolean;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      if new_j->k is distinct from old_j->k then
        sensitive := k like 'banking\_%' or k like '%id\_number%';
        diff := diff || jsonb_build_object(
          k, case when sensitive then jsonb_build_object('old','[redacted]','new','[redacted]')
                  else jsonb_build_object('old', old_j->k, 'new', new_j->k) end);
      end if;
    end loop;
    if diff = '{}'::jsonb then
      return null;
    end if;
  else
    diff := row_j;
    for k in select jsonb_object_keys(row_j) loop
      if k like 'banking\_%' or k like '%id\_number%' then
        diff := jsonb_set(diff, array[k], '"[redacted]"'::jsonb);
      end if;
    end loop;
  end if;

  insert into payroll.audit_log (action, entity, entity_id, pay_run_id, employee_number, details)
  values (
    lower(tg_op) || ' ' || tg_table_name,
    tg_table_name,
    coalesce(row_j->>'id', row_j->>'employee_number'),
    case when tg_table_name = 'pay_runs' then (row_j->>'id')::uuid
         else nullif(row_j->>'pay_run_id', '')::uuid end,
    row_j->>'employee_number',
    diff
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'pay_runs', 'payslips', 'payslip_lines', 'employee_regular_inputs',
    'pay_items', 'employer_settings', 'employees',
    'tax_brackets', 'tax_rebates'
  ] loop
    execute format('drop trigger if exists audit_row_change on payroll.%I', t);
    execute format(
      'create trigger audit_row_change after insert or update or delete on payroll.%I
         for each row execute function payroll.audit_row_change()', t);
  end loop;
end $$;

commit;
