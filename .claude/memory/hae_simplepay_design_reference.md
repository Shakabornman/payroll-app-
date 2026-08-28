---
name: hae-simplepay-design-reference
description: "Real SimplePay screenshots the client is sharing as design reference for the HAE Payroll app frontend — running log, more being added"
metadata: 
  node_type: memory
  type: project
  originSessionId: 716f325f-4837-47e8-beb9-029da4cd5905
  modified: 2026-07-20T18:55:17.589Z
---

Client is sharing real SimplePay screenshots (the legacy system being reverse-engineered) as design reference, starting 2026-07-20, with more to come before deciding the new app's Dashboard structure. Don't finalize Dashboard layout until the client says this batch is complete — they explicitly said they're still adding screens.

**Screen 1 — Employees > Employee List** (tabs: Employee List | Self-Service | Leave Overview | Bulk Actions):
- Filter bar: Pay Point (All), Pay Frequency (All), Current Status (Active), free-text Search, plus a green "Add Employee" button (out of scope for our read-only app, per [[hae_payroll_screen_map]] — HR Portal owns staff capture).
- Table body is **grouped by pay frequency** (group header = frequency name, e.g. "Twice a Month, ending on the 31st - Two Weekly"), each group its own paginated table (columns: Last Name, First Names, Number, and Pay Point in at least one group) with its own "Showing X to Y of Z entries" + Previous/Next pagination.
- Employee numbers shown as plain digits (`0040`, `0033`, `0008`) — **no visible `O-` prefix** in this view, which is worth reconciling against the screen map's claim of "O-prefix format, stripped for exports" (maybe prefix is added only on exports/payslips, not this list — unconfirmed either way).

**Screen 2 — Employees > Self-Service > Employee Users:**
- Same filter bar as Employee List. Table: Employee (Last, First) | E-Mail (editable text input) | Enabled (checkbox) | 2FA? | Last Activity.
- This is the actual admin screen where email-per-employee gets captured and self-service gets toggled on — confirms self-service provisioning is a manual, per-employee, email-then-enable workflow, matching the "low email coverage" explanation from the client.
- **Concrete finding:** `Bomman, Johannes` (employee number 0008, per Screen 1) has email `shakabornman@gmail.com`, Enabled checked, and a "Re-send activation" link — this is the client's own real HAE employee record, actively piloted for self-service in the legacy system. Every other visible row has a blank email + unchecked Enabled. See [[hae_access_control_detail]] for the follow-up: `EMP0000` itself is intentional (CEO's access-only record, no SimplePay data by design), but the client's email currently being linked to `EMP0000` in Firestore rather than `0008` is a separate, unresolved data question.

**Screen 3 — Self-Service > Settings > General Settings:**
- Checkboxes: "Auto-enable Self-Service [NEW]" (when an email address is provided for an employee) — checked. "Attach payslips to emails on Self-Service release" — checked, with a sub-option "Enable password protection for attached payslips (using employee identity numbers or birthdates)" — unchecked. "Allow tax certificates to be released to Self-Service" — unchecked.
- "Self-Service Request Types": "Disable Leave requests?" — unchecked (i.e. leave requests are currently allowed). "Disable Info Update requests?" — unchecked (info update requests currently allowed).
- Useful reference for whenever self-service settings get built (deferred phase, not current scope per [[hae_payroll_screen_map]]) — not needed for the current admin-only build.

**Screens 4-8 — Settings (batch 2, client pre-filtered to "only relevant options"):**

- **Settings landing:** tab bar lists the full SimplePay settings surface — Accounting, Beneficiaries, Custom Items, EFT, Employee Numbers, Employer Details, Employer Filing Details, Job Grades, Leave, Pay Points, Pay Frequencies, Payroll Calculations, Payslip, Templates, Advanced. Most of these are staff/company data capture (HR Portal's job, out of scope per [[hae_payroll_screen_map]]) — client already filtered down to the ones actually relevant to this app.

- **Accounting > Xero integration** (2 screens, directly informs the "Xero export" line item in [[hae_payroll_screen_map]] section 5, previously "format TBD"):
  - *Accounting Integration tab:* connected to Xero, method = "Xero via Journal", one checkbox ("Show journal on cash basis reports in Xero?"), Connect/Disconnect controls.
  - *Pay Run Mapping tab:* real, concrete GL account mapping already configured for "Hospital at Ekhaya" Xero org — this resolves the "format TBD" uncertainty. Debit side groups pay items under "Salary expense" (Basic Salary, Basic Hourly Pay, Pre-opening Income, Extra Shift → account 477 "Wages and Salaries") and "Expense" (SDL-Employer, UIF-Employer → also 477). Credit side groups under "Liability" (Nett Pay → 810 "Salary and Wages Clearing Account"; SDL-Employer, Tax/PAYE, UIF Total → 825 "Employee Tax Payable"; Shift Deduction → 810) and "Debtor" (Repayment of Advance → 810). Each pay item maps 1:1 to a specific debit or credit GL account — this is the actual data shape the Xero export screen needs to replicate (a per-pay-item → GL-account mapping table), not just a generic export button.

- **Custom Items settings:** confirms our seeded `payroll.pay_items` custom rows exactly match the real system — Income group (Daily Rate, Extra Shift, Pre-opening Income), Deduction group (Shift Deduction). No new information, but validates [[hae_payroll_architecture]]'s seed data is correct.

- **EFT settings:** confirms the specific export format needed: **"ABSA Business Integrator Online (.csv)"** — this is the exact named format to implement for the "EFT export" line item in [[hae_payroll_screen_map]] (previously just "ABSA batch, format TBD"), worth researching this format's field layout when that screen gets built. Screen structure: Primary Bank Account (Bank, Account Number, Branch Code, Account Type) plus support for multiple "Additional Bank Accounts" (so the export isn't necessarily single-account). **Real account number/branch code were visible in this screenshot — deliberately not copied into this memory file; ask the client again when actually building the EFT export, or source it from `payroll.employer_settings` once populated (per [[hae_payroll_architecture]], that table exists but is "mostly null pending accountant").**

**Screens 9-13 — Settings (batch 3):**

- **Employer Details:** real populated data — Trading Name "Hospital AT Ekhaya", Physical Address: Street number 24952, Street "Hulana & Motopo", Suburb/district "Galeshewe", City/town "Kimberley", Code 8345 (unit number/complex blank), plus a company logo upload. This is `payroll.employer_settings` data — useful for the Dashboard's "read-only employer settings snapshot" and any report letterhead. Business address, not sensitive in the way banking details are — fine to keep here.

- **Employer Filing Details:** every statutory/filing field shown as blank in SimplePay's own UI — PAYE Number, SIC Main Group/Level 2/3/4/Code, Telephone Number, all SARS Contact fields (Name/Surname/Position/Bus Tel/Cell/Email), "report employee numbers on tax certs" flag, UIF Number, CIPRO company registration number, UI-19 postal address. **Correction, 2026-07-20:** this does NOT mean the data doesn't exist anywhere — client clarified the accountant filed these directly on the live SARS eFiling system and only ever used SimplePay for report generation, not this settings screen. Real values exist (with SARS/the accountant) and will be shared once retrieved. Don't assume `payroll.employer_settings` will stay null — expect real PAYE/UIF/SIC values incoming. Full field list above is still the target shape for the Employer Details/Filing Details section.

- **Leave Types:** Annual, Sick, Family Responsibility, Unpaid — confirms leave type configuration lives entirely in Settings > Leave, with a link straight to "Self-Service Settings." Reinforces [[hae_payroll_screen_map]]'s existing note: leave rules/calculations are owned by Firebase's leave module, not this app — nothing to build here.

- **Pay Points / Pay Frequencies:** both screens just confirm our already-seeded values (H@E, KRC, Vuma / the three frequency names) match the real system exactly — no new information, pure validation.

**Screens 14-16 — Settings (batch 4):**

- **Payroll Calculations menu** (not opened, just the menu itself): Basic Pay (incl. Sundays and Public Holidays), Termination Preferences [NEW], BCEA Leave Pay, ETI (Employment Tax Incentive), Additional ETI (COVID19), Garnishees, SDL (Skills Development Levy), Cost to Company [NEW], Pro-Rata Method. Matches the statutory `payroll.pay_items` categories already seeded (ETI, SDL, Garnishee etc.) — confirms those are real, distinct configurable calculation areas, not just catalog rows.

- **Payslip settings — important, this is the field-level spec for the eventual Payslip Preview screen** (real HAE configuration, not defaults):
  - Format: "Mask ID number" checked. "Use format for self-sealing confidential stationery" and "Hide dates" both unchecked.
  - Payroll Items shown: YTD balances checked (but not "even when 0", and not cumulative/take-on). Employer Contributions, taxable Income Deductions, Benefits, Cost to Company, hourly rate for salaried — all their "do not show" toggles unchecked, i.e. all of those currently DO show except Cost to Company.
  - Employee Info shown: Employee Number checked, Additional Number unchecked, Income Tax Number unchecked. **"Print employee banking details (if paid via EFT)" is checked, AND its sub-option "Mask Bank Account Number" is also checked** — Pay Point checked, Residential Address checked.
  - Company Info: "Do not print Trading Name heading" checked (logo already contains it).
  - Leave: both "Do not show" toggles unchecked, i.e. Leave Balances and Leave Adjustments both currently show on the payslip.
  - Other: "Use old payslip format (Version 1)" checked.
  - **This directly corroborates [[hae_payroll_screen_map]]'s bank-masking must-fix**: the real SimplePay system already masks both bank account numbers and ID numbers on live payslips by default — strengthens rather than contradicts the requirement that `bank_masking_snippet.py` must be wired into the new Payslip Preview before shipping it. Full toggle list above is close to a literal field spec for that screen's options.

- **Advanced Settings:** only "Custom name field for pay frequencies" is checked (explains why `payroll.pay_frequencies` uses descriptive custom names rather than generic ones — matches what we already seeded). Everything else (Goal Seek, age limit override, report password protection, Reminders, Claim Requests in Self-Service, leave-in-hours display, split pay for custom leave types, STATSSA quarterly report) is off. Low actionability now, but Enable Claim Requests in Self-Service and the STATSSA report are worth remembering as future-phase features already present in the source system.

**How to apply:** This is incremental — check back here for more screens before finalizing Dashboard design. Use the grouped-by-pay-frequency list pattern as a strong reference point for the Employee Selector / Payslip processing employee list, since it's a real, validated UI pattern from the source system rather than an invented one. When the Exports screen eventually gets built, the Xero Pay Run Mapping table above is real, usable reference data — don't re-ask the client for GL account mappings that are already captured here. When the Dashboard's employer settings snapshot gets built, the Employer Details data above is real and usable too. When Payslip Preview gets built, use the Payslip settings toggle list above as the starting field spec rather than inventing one.
