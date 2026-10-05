-- Audit trail: restore keeps original time and user; app events include
-- access_refused. Applied after 20261005090000_payroll_audit_hardening.sql.

begin;

create or replace function payroll.audit_log_stamp()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  claims json := nullif(current_setting('request.jwt.claims', true), '')::json;
begin
  if coalesce(current_setting('payroll.audit_restoring', true), '') = 'on' then
    return NEW;
  end if;
  NEW.occurred_at := now();
  NEW.actor_uid   := coalesce(claims->>'sub', 'system');
  NEW.actor_email := coalesce(claims->>'email', 'system');
  return NEW;
end;
$$;

create or replace function payroll.unarchive_audit_month(p_month text)
returns integer language plpgsql security definer set search_path = payroll as $$
declare n integer;
begin
  perform set_config('payroll.audit_restoring', 'on', true);
  insert into payroll.audit_unarchived_months (archive_month) values (p_month) on conflict do nothing;
  insert into payroll.audit_log (id, occurred_at, actor_email, actor_uid, action, entity, entity_id, pay_run_id, employee_number, details)
  select x.id, x.occurred_at, x.actor_email, x.actor_uid, x.action, x.entity, x.entity_id, x.pay_run_id, x.employee_number, x.details
  from payroll.audit_log_archive x where x.archive_month = p_month
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  delete from payroll.audit_log_archive where archive_month = p_month;
  perform set_config('payroll.audit_restoring', 'off', true);
  return n;
end;
$$;

create or replace function payroll.log_app_event(p_action text, p_entity text, p_entity_id text, p_pay_run_id uuid, p_employee_number text, p_details jsonb)
returns void language plpgsql security definer set search_path = payroll as $$
begin
  if p_action not in ('sign_in','sign_out','access_refused','export_csv','export_xero','export_eft','print_payslip','report_generated') then
    raise exception 'Unknown audit action: %', p_action;
  end if;
  insert into payroll.audit_log (action, entity, entity_id, pay_run_id, employee_number, details)
  values (p_action, p_entity, p_entity_id, p_pay_run_id, p_employee_number, p_details);
end;
$$;

commit;
