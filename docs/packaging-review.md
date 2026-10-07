# Payroll app: layout and usage review, packaging plan

> Snapshot from 4 Oct 2026. Since then `main` has gained the audit trail,
> statutory reports (EMP201, EMP501, UIF), EFT and Xero exports and payslip
> print. The status table below is out of date; the packaging decisions and the
> pre-release list still apply.

Review date: 2026-10-04. Based on the code and project notes. No live data or
sign-in was available, so screens were not seen running against real data.
`next build` and `eslint` pass.

## Current state

| Screen | Status |
|---|---|
| Login | Working. Firebase email/password plus a staff-record email match. |
| Dashboard | Partly built. Latest pay period and quick links work; "Outstanding items" is "Coming soon". |
| Payslip processing | Working. Runs grouped by frequency, payslip detail, bulk finalise, post run. |
| Hours & timesheets | Working. Hourly capture with live PAYE/UIF/SDL recalculation. |
| Employees | Working. Read-only searchable list. |
| Statutory reports | Placeholder ("Not built yet"). |
| Exports | Placeholder ("Not built yet"). |
| /rls-test | Leftover debug page. |

All routes are static client-side pages. No server routes or server-side secrets,
so it can be hosted as a static site.

## Packaging decisions

- Delivery: module linked from Ekhaya Connect, sharing its login session. The
  standalone `/login` page can remain as a fallback. How the session is handed
  over still needs to be decided with the Ekhaya Connect side.
- First audience: payroll staff and the accountant.
- Bar set by the CEO: a polished product. No "coming soon" screens, everything
  working, proper audit trail.

## Before the first release

1. Ekhaya Connect login handover.
2. Bank masking everywhere banking data is shown (confirmed only on payslip detail).
3. Remove `/rls-test`.
4. Replace the "Create Next App" title and default README; add a short guide for running a pay cycle.
5. Confirm Supabase GRANTs and payroll_admin-only access; replace "ask the client to run GRANT" messages with user-facing ones.
6. Show the data boundary (payroll data currently loaded through Sept 2025) on every screen.
7. Real audit trail: record who finalised, posted, exported or submitted what, and when.
8. Payslip PDF/print on the HAE letterhead.
9. Statutory reports (EMP201, EMP501, UIF Declaration first, then UI-19) and EFT/Xero exports.
10. Dashboard "Outstanding items".
11. Full test with a real pay run; compare PAYE against a known SimplePay result.
12. Apply HAE branding (logo, colours, fonts) to the real app.

## Later

IT3(a)/IRP5 and OID return once layouts are resolved; staff self-service view
once verified emails are available.

## Housekeeping

The migration file `20260715090000_payroll_pay_items_extension(1).sql` has a stray `(1)` in its name.
