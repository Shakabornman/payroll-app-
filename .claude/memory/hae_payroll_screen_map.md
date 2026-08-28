---
name: hae-payroll-screen-map
description: "Full screen/feature scope for the HAE Payroll app frontend, from the client's screen map + mindmap (2026-07-20) — supersedes earlier assumptions about self-service scope"
metadata: 
  node_type: memory
  type: project
  originSessionId: 716f325f-4837-47e8-beb9-029da4cd5905
  modified: 2026-07-22T14:13:51.000Z
---

Client supplied `HAE_Payroll_App_Screen_Map.md` + a mindmap image on 2026-07-20, prepared specifically as pre-build reference for this frontend. This is authoritative scope, more specific than the original technical handoff — check here before assuming a screen's shape.

**Architecture correction — this app's current build phase is admin-only, not that self-service is cancelled:** The Payroll app is a **module link housed inside Ekhaya Connect**, not a separate destination, and uses the **same Firebase login session as the rest of Ekhaya Connect**. Access is gated at `payroll_admin` tier via Supabase RLS (`payroll_admin_full_access` policy bridged from the Firebase JWT) — this build phase is admin/payroll-staff tooling. Staff/company data capture (address, ID number, banking, classification) is explicitly out of scope here — that lives in the HR Portal; this app only ever reads synced data, never captures or edits identity/banking/classification.

**Client correction, 2026-07-20: self-service is not dead, just not this phase.** Low coverage of verified employee email addresses (not every staff member has one on record/matched yet) is what shifted the plan to build admin tooling first — self-service is deferred, not cancelled. Don't describe or imply the self-service view as out of scope permanently in future work.

**Open question this raises, not yet resolved with the client:** whether "same Firebase login session as the rest of Ekhaya Connect" means this app should assume an already-authenticated session (embedded/linked from Ekhaya Connect, no independent login screen needed) rather than the standalone `/login` page already built in [[hae_frontend_decisions]]. Built standalone login as a pragmatic first step since Ekhaya Connect's actual shell wasn't available to integrate with — flag to client before too much more is built on the standalone-login assumption.

**Data flow, restated precisely:** Firebase is the source of truth for staff identity/banking/classification/employer details, synced to Supabase via `syncPayrollEmployeeOnWrite` (on-write trigger) + a daily safety-net job. Leave *rules and calculations* stay owned by Firebase's leave module — only the resulting *balance* is written to Supabase; Payroll app reads and displays it, never computes or edits it.

**Employee number format:** real employee numbers use an **`O-` prefix** (stripped for exports) — e.g. likely `O0008`-style, not the `EMP0000` format seen in the Firestore `employees` doc during RLS testing. This is further evidence that the `EMP0000` record found during the [[hae_payroll_architecture]] RLS bridge test was a placeholder/non-standard record, not a real provisioned employee — reinforces treating that as a data-linkage question, not a bridge bug.

**Screens (in the client's priority/reading order):**
1. **Dashboard** — landing screen after opening Payroll from Ekhaya Connect. Pay period status, quick links, outstanding-items panel (unreconciled hours, missing timesheets, pending filings, variances), read-only employer settings snapshot.
2. **Payslip processing** — the core monthly workflow. Pay period selector, read-only filterable employee list (from synced `payroll.employees`), movement capture (allowances/deductions/overtime/bonuses/ad hoc), reconciliation view (reuses existing Variance report logic), read-only leave balance display, individual payslip preview (validated letterhead template), batch/bulk generation (reuses existing Bulk Payslips report).
3. **Hours & timesheet reconciliation** — for hourly workers. Timesheet processor's Payroll link is **built but not live** (processor itself is dev-complete, in testing) — do not wire the auto-pull until confirmed live. Variance flagging + manual override with reason code in the meantime.
4. **Statutory reports & filings** — table of report status:
   - EMP201 (monthly) — built, validated
   - EMP501 (bi-annual) — built, validated, 28/28 figures exact
   - UIF Declaration (bi-annual) — built, validated
   - UI-19 (monthly) — **not yet built**, distinct from UIF Declaration
   - OID Return (annual) — scoped, not built, fixed 10% "Projected" uplift convention confirmed
   - IT3(a)/IRP5 individual — figures validated to the cent, **visual layout still unresolved**
   - IT3(a)/IRP5 bulk — blocked on individual layout being resolved first
   - For IT3(a)/IRP5 layout specifically: verify structure programmatically (`python-docx` for table cells, `pdfinfo` for page count) against the real SimplePay certificate — text-extraction-based inference was the documented failure mode last session.
5. **Exports** — EFT (ABSA batch format, TBD in detail) and Xero (accounting entries for processed pay runs). Both future builds.
6. **Employee selector** — shared component reused across Payslip processing and Reports, not a standalone destination. Search/filter by name, employee number, pay point, classification. Read-only, no edit (corrections route back to HR Portal). **This is the natural place to finally wire in `bank_masking_snippet.py`**, which exists but has never actually been applied anywhere.

**Must-fix before shipping anything with banking data:** bank masking is currently unapplied everywhere in the stack. Apply it at minimum in Payslip Preview and the Employee Selector before either goes live.

**Known unmodeled data limitation restated:** `payroll.employees` has a single `employment_date` column — no multiple service periods/rehire support. Don't build UI assumptions around a person having only one employment period ever, even though the data can't currently represent more.

**Confirmed 2026-07-20 — real backend blocker, not a frontend bug:** built the Employee Selector against `payroll.employees` directly (see [[hae_payroll_architecture]] for the component) and a real logged-in browser session got `42501 permission denied for table employees`. Cross-checked against `roles_and_rls.sql` + `user_access_and_rls_update.sql`: neither grants `SELECT` on any raw `payroll`/`his` table to the `authenticated` Postgres role — only to the server-only `payroll_service`/`his_service` roles. Only `shared.user_access` is granted to `authenticated`. The only reason `payroll.my_employee_profile` works at all is that view (and its grants) was created live via SQL Editor, outside every migration file available locally — same drift pattern as `get_own_employee_number()`.

**Exact fix needed (someone with Supabase SQL Editor access must run this — not something Claude Code can or should do itself):** `GRANT SELECT ON payroll.employees TO authenticated;` (and the same for `payroll.pay_points`, which the Employee Selector also queries, plus any other payroll table future screens query directly). Also worth confirming whether a `payroll_admin`-recognizing RLS policy actually exists live — every migration we have only defines `executive_full_access` (checks `has_access_level('executive')`), never `payroll_admin`, so granting the table alone may still yield zero rows for a payroll_admin-only account unless a matching policy already exists live (unconfirmed either way).

**Resolved 2026-07-20:** client applied the grants directly (self-managed Supabase SQL Editor access). Employee Selector now returns real data end-to-end from a real browser session. This is the strongest evidence yet that the whole chain works: Firebase Auth → Third-Party Auth token → `authenticated` role → RLS policy recognizing this account's access level → real rows returned. Treat the `auth.uid()` bridge and `payroll_admin`-tier access as confirmed working, not just provisional, for tables that have been granted. Still worth granting other payroll tables (`pay_frequencies`, `pay_runs`, `payslips`, `payslip_lines`, `employee_regular_inputs`, `employer_settings`) proactively as each new screen needs them, rather than assuming the earlier GRANT covered the whole schema — it was scoped to `employees` and `pay_points` only.

**How to apply:** Build the Employee Selector early since Payslip processing and Reports both depend on it — avoid building it twice inline. Any *new* table a screen queries directly may need its own `GRANT SELECT ... TO authenticated` the first time it's used — check for 42501 early when wiring a new table rather than assuming the earlier grant covers it, and hand the exact GRANT statement to the client each time rather than re-diagnosing from scratch.

**Known gap, formalized 2026-07-20 in `HAE_Payroll_App_Screen_Map_1.md` (client's revised doc) — regular pay items are not synced, blocks Payslip processing for new hires:** `payroll.employee_regular_inputs` (`id`, `employee_number`, `pay_item_id`, `amount`, `effective_from`, `effective_to` nullable, `created_at`) is a separate table from `payroll.employees`, and `syncPayrollEmployeeOnWrite` never touches it. A newly HR-Portal-synced employee has zero rows here — nothing for Payroll to process against. **Not just salary** — `pay_item_id` means this holds *any* recurring pay item (Basic Salary, Housing Allowance, Travel Allowance, etc.), each dated independently. This is a cross-team fix: needs a pay-item-picker + amount + effective-date capture UI in HR Portal, plus new/extended sync logic in `firebase-functions/functions/index.js` (extend `syncPayrollEmployeeOnWrite` or add a dedicated function) — not something to work around in the Payroll frontend.

- **New hire:** one row per applicable pay item, `effective_from` = employment date, `effective_to` = `NULL` (open-ended).
- **Raise/permanent change:** insert a new row, `effective_from` = change date. Closing out the old row's `effective_to` is *not* strictly required if "current amount" is defined as "latest `effective_from` that's `<= today`" — insert-only works fine for this case.
- **Item discontinued with no replacement** (e.g. an allowance dropped, salary continues): this is the one case that genuinely requires setting `effective_to` on the old row — without it, a row with no end date reads as still active forever.
- **Does NOT belong in this table:** once-off/temporary amounts (bonuses, short-term bumps) — those are payslip movements, not regular-input history. Termination is tracked separately via `end_service_reason_code` on `payroll.employees`, no overlap with this table.
- **Frontend implication for whenever Payslip Processing gets built:** treat "employee has no `employee_regular_inputs` row yet" as a legitimate, expected state (same pattern as unclassified employees, per the original handoff) — not an error — since this gap will likely persist for a while regardless of when the HR Portal side gets fixed.
