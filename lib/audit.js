import { supabase } from "@/lib/supabase";

// Events the database can't see on its own (sign-in, exports, prints). Data
// changes are logged by database triggers and don't go through here. The
// function only accepts a fixed list of actions, and it takes the actor from
// the sign-in token, so the browser can't set who did it.
export async function logAudit({ action, entity, entityId, payRunId, employeeNumber, details }) {
  const { error } = await supabase.rpc("log_app_event", {
    p_action: action,
    p_entity: entity ?? null,
    p_entity_id: entityId != null ? String(entityId) : null,
    p_pay_run_id: payRunId ?? null,
    p_employee_number: employeeNumber ?? null,
    p_details: details ?? null,
  });
  return { error };
}

export function auditErrorText(error) {
  return `Action completed, but the audit log could not be written: ${error.code ?? ""} ${error.message}`.trim();
}
