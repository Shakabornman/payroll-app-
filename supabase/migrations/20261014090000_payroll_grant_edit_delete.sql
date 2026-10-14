-- Edit/delete dialogs added in components/edit-payslip-line-dialog.jsx and
-- components/edit-regular-input-dialog.jsx need these on top of the existing
-- INSERT/SELECT grants (payslips already has UPDATE from earlier work).
grant delete on payroll.payslip_lines to authenticated;
grant update on payroll.employee_regular_inputs to authenticated;
