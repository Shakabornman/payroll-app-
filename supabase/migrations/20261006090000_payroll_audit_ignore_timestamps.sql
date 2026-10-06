-- Audit: a nightly employee sync touches only updated_at and last_synced_at.
-- Those columns are no longer logged, so unchanged rows write nothing.
-- Applies on top of 20261005090000_payroll_audit_hardening.sql.
create or replace function payroll.audit_row_change()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
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
      if k in ('updated_at', 'last_synced_at') then continue; end if;
      if new_j->k is distinct from old_j->k then
        sensitive := k like 'banking\_%' or k like '%id\_number%';
        diff := diff || jsonb_build_object(k, case when sensitive then jsonb_build_object('old','[redacted]','new','[redacted]')
                  else jsonb_build_object('old', old_j->k, 'new', new_j->k) end);
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  else
    diff := row_j;
    for k in select jsonb_object_keys(row_j) loop
      if k like 'banking\_%' or k like '%id\_number%' then
        diff := jsonb_set(diff, array[k], '"[redacted]"'::jsonb);
      end if;
    end loop;
  end if;
  insert into payroll.audit_log (action, entity, entity_id, pay_run_id, employee_number, details)
  values (lower(tg_op) || ' ' || tg_table_name, tg_table_name,
    coalesce(row_j->>'id', row_j->>'employee_number'),
    case when tg_table_name = 'pay_runs' then (row_j->>'id')::uuid else nullif(row_j->>'pay_run_id', '')::uuid end,
    row_j->>'employee_number', diff);
  return null;
end;
$$;
