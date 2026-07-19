-- ============================================================================
-- Migration: payroll.pay_items behavior columns + catalog seed data
-- Prepared: 15 July 2026, Payroll planning chat
-- Rationale: 03_ADDENDUM_PAYROLL_SCHEMA_FINDINGS.md §2.1, §2.2, §4
--
-- This closes the Phase 1 gap: pay_items as originally built (id, code, name,
-- category, is_custom) cannot represent the calculation behavior confirmed
-- from real SimplePay Custom Item screens (Daily Rate, Extra Shift, Shift
-- Deduction) and the reconciled Mar-Sept 2025 export. No data has been loaded
-- yet, so this is safe to run as a single migration.
--
-- Apply via: supabase db push (after copying into payroll-app's own
-- supabase/migrations folder), or paste directly into the SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New columns on payroll.pay_items
-- ----------------------------------------------------------------------------

alter table payroll.pay_items
  add column input_type text not null default 'once_off'
    check (input_type in ('once_off', 'rate_times_quantity', 'recurring')),
  add column hours_worked_factor numeric(6,4),
  add column rate_varies_by_employee boolean not null default false,
  add column tax_treatment text not null default 'regular'
    check (tax_treatment in ('regular', 'irregular_annualized')),
  add column counts_toward_leave_rate boolean not null default false,
  add column is_overtime boolean not null default false,
  add column counts_toward_eti_wage boolean not null default false,
  add column counts_toward_cost_to_company boolean not null default true,
  add column excluded_from_eti_remuneration boolean not null default false,
  add column is_active boolean not null default true;

-- CONFIRMED: payroll.pay_items already had a category check constraint from
-- the original migration (not visible in our earlier information_schema
-- export, which only covered PK/FK/UNIQUE, not CHECK constraints). Its real
-- definition, pulled via pg_constraint: category in
-- ('income', 'deduction', 'employer_contribution', 'statutory').
-- This is a real four-way split, not the three-way one first assumed:
-- 'deduction' means non-statutory/voluntary employee-side deductions
-- (Shift Deduction, Repayment of Advance, Garnishee); 'statutory' is for
-- employee-side statutory items (PAYE, UIF-Employee, ETI); employer-side
-- statutory costs get 'employer_contribution' (UIF-Employer, SDL-Employer),
-- not 'statutory'. All seed values below reflect this.

comment on column payroll.pay_items.input_type is
  'once_off = ad-hoc per payslip; rate_times_quantity = rate x hours/units; recurring = dated amount captured via employee_regular_inputs (e.g. Basic Salary)';
comment on column payroll.pay_items.tax_treatment is
  'regular = normal periodic PAYE table lookup; irregular_annualized = SARS annualisation method for irregular/bonus-type income (SimplePay: "Taxed Annually")';
comment on column payroll.pay_items.is_active is
  'false = catalog item not currently in use at HAE (ETI, Garnishees, etc.) - kept as an inactive row rather than deleted or omitted, per the catalog-rows-not-migrations principle in 00_PROJECT_BRIEF.md §3';

-- ----------------------------------------------------------------------------
-- 2. Seed payroll.pay_points
-- ASSUMPTION: descriptions below are placeholders - HAE to confirm/correct,
-- particularly what "KRC" stands for.
-- ----------------------------------------------------------------------------

insert into payroll.pay_points (name, description) values
  ('H@E', 'Hospital at Ekhaya'),
  ('KRC', 'KRC cost centre - description to confirm'),
  ('Vuma', 'Vuma Development Solutions (Pty) Ltd')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Seed payroll.pay_frequencies
--
-- OPEN QUESTION, DECISION MADE HERE (please confirm or override):
-- The client confirmed "Pay Run 15" (29th prev month -> 13th) and "Two
-- Weekly" (14th -> 28th) together represent one bi-weekly rhythm for all
-- hourly staff. But the Pay Runs screen showed both as separately named,
-- simultaneously pending runs on the same date with DIFFERENT headcounts
-- (13 vs 16 payslips) - which reads more like two distinct employee-frequency
-- assignments than one frequency generating two runs. Since
-- payroll.employees.pay_frequency_id is a single FK (one frequency per
-- employee), both can't literally be true at once for the same employee.
--
-- DECISION: seed all three frequencies as they exist in SimplePay's own
-- Settings (no data loss), but treat "Two Weekly" as the frequency actually
-- assigned to hourly employees going forward, since that's what the
-- Employee List screen showed employees grouped under. "Pay Run 15" is
-- seeded but not assumed to be an active employee assignment - revisit
-- once employees are actually seeded/matched in Phase 3 against the
-- historical export, which will show ground truth.
--
-- period_rule encoding: a simple semicolon-delimited key=value text scheme,
-- not yet validated against a parser (none exists yet - this is descriptive
-- until pay_runs generation logic is built). weekend_shift=unresolved flags
-- the known TODO from 01_HANDOFF_PAYROLL.md §4 (15th-falls-on-weekend rule).
-- ----------------------------------------------------------------------------

insert into payroll.pay_frequencies (name, period_rule, description) values
  (
    'Monthly, ending on the 31st - Pay Run Month End',
    'MONTHLY:anchor_day=31;period=calendar_month;weekend_shift=n/a',
    'Fixed salaried staff. One run per calendar month.'
  ),
  (
    'Monthly, ending on the 15th - Pay Run 15',
    'MONTHLY:anchor_day=15;period=prev_month_29_to_13;weekend_shift=unresolved',
    'Seeded from SimplePay config. Not currently assumed to be an active employee assignment - see decision note above. Revisit in Phase 3.'
  ),
  (
    'Twice a Month, ending on the 31st - Two Weekly',
    'SEMIMONTHLY:cutoff_a_day=13,cutoff_b_day=28;period_a=prev_29_to_13;period_b=14_to_28;weekend_shift=unresolved',
    'Hourly staff, paid bi-weekly ("give and take" around the 15th/month-end split, per client). Generates two pay_runs per month.'
  )
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- 4. Seed payroll.pay_items
-- Flags marked [CONFIRMED] came directly from a reviewed SimplePay screen or
-- the reconciled export. Flags marked [INFERRED] are a reasonable default
-- with no direct screen evidence - flagged so they're easy to find and
-- correct later rather than silently assumed.
-- ----------------------------------------------------------------------------

-- Statutory / built-in items (is_custom = false)
insert into payroll.pay_items
  (code, name, category, is_custom, input_type, hours_worked_factor, rate_varies_by_employee,
   tax_treatment, counts_toward_leave_rate, is_overtime, counts_toward_eti_wage,
   counts_toward_cost_to_company, excluded_from_eti_remuneration, is_active)
values
  ('BASIC_HOURLY', 'Basic Hourly Pay', 'income', false, 'rate_times_quantity', 1.0, true,
   'regular', true, false, true, true, false, true),          -- [INFERRED] flags: no dedicated screen reviewed for this built-in item
  ('BASIC_SALARY', 'Basic Salary', 'income', false, 'recurring', null, true,
   'regular', true, false, true, true, false, true),           -- [INFERRED] captured via employee_regular_inputs, not payslip_lines directly
  ('PAYE', 'Tax (PAYE)', 'statutory', false, 'once_off', null, true,
   'regular', false, false, false, false, false, true),        -- [CONFIRMED] column present in every export row; category=statutory (employee-side statutory deduction)
  ('UIF_EE', 'UIF - Employee', 'statutory', false, 'once_off', null, false,
   'regular', false, false, false, false, false, true),        -- [CONFIRMED] category=statutory
  ('UIF_ER', 'UIF - Employer', 'employer_contribution', false, 'once_off', null, false,
   'regular', false, false, false, true, false, true),         -- [CONFIRMED] category=employer_contribution (employer-side, distinct from employee-side 'statutory')
  ('SDL_ER', 'SDL - Employer', 'employer_contribution', false, 'once_off', null, false,
   'regular', false, false, false, true, false, true)          -- [CONFIRMED] 1% of leviable remuneration, per 01_HANDOFF_PAYROLL.md §5; category=employer_contribution
on conflict (code) do nothing;

-- Custom items with a directly reviewed SimplePay screen
insert into payroll.pay_items
  (code, name, category, is_custom, input_type, hours_worked_factor, rate_varies_by_employee,
   tax_treatment, counts_toward_leave_rate, is_overtime, counts_toward_eti_wage,
   counts_toward_cost_to_company, excluded_from_eti_remuneration, is_active)
values
  ('DAILY_RATE', 'Daily Rate', 'income', true, 'rate_times_quantity', 1.0, true,
   'irregular_annualized', false, false, false, true, false, true),   -- [CONFIRMED] Edit Custom Income screen
  ('EXTRA_SHIFT', 'Extra Shift', 'income', true, 'once_off', null, false,
   'irregular_annualized', false, false, true, true, false, true),    -- [CONFIRMED] Edit Custom Income screen
  ('SHIFT_DEDUCTION', 'Shift Deduction', 'deduction', true, 'once_off', null, false,
   'regular', false, false, false, false, true, true)                -- [CONFIRMED] Edit Custom Deduction screen (BCEA deduction checked)
on conflict (code) do nothing;

-- Custom items confirmed real in the historical export, but with no
-- dedicated Edit screen reviewed - flags below are [INFERRED] defaults.
insert into payroll.pay_items
  (code, name, category, is_custom, input_type, hours_worked_factor, rate_varies_by_employee,
   tax_treatment, counts_toward_leave_rate, is_overtime, counts_toward_eti_wage,
   counts_toward_cost_to_company, excluded_from_eti_remuneration, is_active)
values
  ('PRE_OPENING_INCOME', 'Pre-opening Income', 'income', true, 'once_off', null, false,
   'irregular_annualized', false, false, false, true, false, false), -- [INFERRED flags, CONFIRMED status] Client confirmed explicitly: real historical pay (R572k, Mar-Sept 2025), will never be used again going forward. Seeded inactive=false from the start - inactive rows can still be safely referenced by historical payslip_lines via pay_item_id, no FK dependency on is_active.
  ('REPAYMENT_ADVANCE', 'Repayment of Advance', 'deduction', true, 'once_off', null, false,
   'regular', false, false, false, false, false, true)               -- [CONFIRMED as flat deduction, no ledger] per HAE decision
on conflict (code) do nothing;

-- Dormant items: confirmed present in SimplePay's Payroll Calculations menu
-- but not currently used at HAE. Seeded inactive so the catalog reflects
-- what SimplePay offers without building any calculation logic behind them.
insert into payroll.pay_items
  (code, name, category, is_custom, input_type, is_active)
values
  ('ETI', 'Employment Tax Incentive (ETI)', 'statutory', false, 'once_off', false),   -- SARS-defined incentive that reduces PAYE liability - categorized statutory, not deduction
  ('ETI_COVID19', 'Additional ETI (COVID-19)', 'statutory', false, 'once_off', false),
  ('GARNISHEE', 'Garnishee', 'deduction', true, 'once_off', false)                     -- [JUDGMENT CALL] court-ordered but modeled as 'deduction' not 'statutory' since it's individual-order-driven, not a SARS Fourth Schedule item like PAYE/UIF/SDL. Revisit if this distinction matters for reporting.
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Verification queries (run after applying)
-- ----------------------------------------------------------------------------
-- select code, name, category, input_type, tax_treatment, is_active from payroll.pay_items order by category, code;
-- select name, period_rule from payroll.pay_frequencies;
-- select name, description from payroll.pay_points;
