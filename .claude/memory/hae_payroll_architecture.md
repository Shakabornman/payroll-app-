---
name: hae-payroll-architecture
description: "HAE HR Payroll system architecture — Firebase (HR/auth) + Supabase (payroll/financial data), auth bridge mechanism, access control model, schema state"
metadata: 
  node_type: memory
  type: project
  originSessionId: 716f325f-4837-47e8-beb9-029da4cd5905
  modified: 2026-07-20T18:39:40.037Z
---

Building a web frontend (to live in GitHub) for an HR Payroll system at [C:\HAE](C:\HAE), reverse-engineered from a legacy system (SimplePay) with backend now at the tail end of development. Backend built by a separate "Payroll chat"/team; a written handoff (`10_TECHNICAL_HANDOFF_CLAUDE_CODE.md`, dated 2026-07-18) was provided 2026-07-19 to brief frontend work.

**Backend split:**
- Firebase project `hae-vuma-92fca` — HR data, Firebase Auth (identity provider), Firestore, Cloud Functions (`firebase-functions/functions/index.js`), Firestore/Storage rules.
- Supabase project `hae-vuma` (ref `wgmtkvlpafqdqaordhoz`) — financial/payroll data. Schemas exposed via Data API: `payroll`, `his` (independently built apps sharing one Supabase project). Schema `shared` is NOT exposed via Data API — server-to-server only, holds cross-cutting auth-bridge functions/tables; never call from frontend.

**Auth bridge (critical, non-obvious):** Not standard Supabase-native auth. Supabase trusts Firebase-issued ID tokens directly via **Third-Party Auth** — frontend authenticates with Firebase Auth normally, then passes that same Firebase ID token to Supabase client calls. No separate Supabase login, no token exchange server.

**Known bug in the bridge — verify before trusting RLS:** Supabase's `auth.uid()` casts JWT `sub` claim to UUID, but Firebase UIDs are 28-char alphanumeric strings (not UUID format), so `auth.uid()` fails silently for every Firebase-authenticated request. Fix (allegedly written, deploy status unconfirmed as of handoff): use `current_setting('request.jwt.claims', true)::json->>'sub'` instead. Affects `shared.has_access_level(lvl text)` and `shared.get_own_employee_number()`. All backend validation so far was done via Supabase SQL Editor, which bypasses this auth layer entirely — **do not assume access-controlled queries work from a real browser session without explicit testing.**

**Bridge tested 2026-07-20, looks like it works — but inconclusively.** Built a browser-based test (`app/rls-test/page.js` in the frontend repo) and had the client sign in with a real HAE account. Result: querying `payroll.my_employee_profile` (RLS-governed view) succeeded with zero rows (no auth/permission error) — meaning the Firebase token was accepted and correctly mapped to the Postgres `authenticated` role, and the RLS-governed view executed cleanly. A separate direct query against raw `payroll.employees` failed with `42501 permission denied` — checked against migrations (`20260714120300_roles_and_rls.sql`, `20260714130000_user_access_and_rls_update.sql`) and confirmed this is **expected**: no migration grants `SELECT` on raw payroll tables to `authenticated`, only to `payroll_service`/`his_service` service roles. Self-service is meant to go only through governed views/functions like `my_employee_profile`. So the 42501 is correct-by-design, not a bug.

**Zero rows explained by test-account data, not a broken bridge:** the test account's Firestore `employees` doc resolved to employee number `EMP0000`, not their real number (`0008`, per [[hae_access_control_detail]] — `EMP0000` is intentionally the CEO's access-only record, no SimplePay/payroll data expected for it by design, but the client's own email currently being linked to it is a separate, unresolved data question). Confirmed no duplicate Firestore docs share that email — it's a genuine single match, so this is a Firestore/`access_control` data-linkage question, not a code or RLS bug.

**`auth.uid()` bridge now confirmed working, not just provisional (2026-07-20):** after the client granted `SELECT` on `payroll.employees`/`payroll.pay_points` to `authenticated` (see [[hae_payroll_screen_map]]), a real browser session successfully read real rows through RLS. This proves the full chain end-to-end: Firebase token → Third-Party Auth → `authenticated` role → RLS policy → real data. Treat the bridge as working, not "provisional," for any table that has been granted.

**Access control model:**
- `shared.user_access` table: `uid` (Firebase UID, text, PK), `access_levels` (text array), `employee_number` (text).
- Access levels: `'executive'`, `'payroll_admin'` — same tier, both full access, not a hierarchy. No read-only-admin or department-scoped roles yet.
- Self-service (employee viewing own data) is a separate RLS pattern (row-level match via `shared.get_own_employee_number()` against `payroll.payslips.employee_number` etc.), not an access level.
- `payroll.my_employee_profile` view exposes employee data to self-service users WITHOUT banking details — use for "my profile" screens instead of querying `payroll.employees` directly for non-admins.
- Source of truth for roles: Firestore `access_control/{uid}` documents, synced into `shared.user_access` via `syncUserAccess` Cloud Function (real-time trigger). Never write directly to `shared.user_access` from frontend — go through the Firestore document.

**Schema state (`payroll` schema):** tables `pay_frequencies`, `pay_points`, `employees`, `pay_items`, `employee_regular_inputs`, `pay_runs`, `payslip_lines`, `payslips`, `leave_balances` (schema exists but intentionally unpopulated — leave module built separately in Ekhaya Connect's HR Portal, do not build against it), `employer_settings` (single-row company config, mostly null pending accountant).

`payroll.employees` has classification columns: `is_director`, `normal_work_hours_category`, `has_written_declaration_no_other_employer`, `works_less_than_24_hours_month`, `is_independent_contractor`, `uif_exempt`, `uif_exemption_reason`, `end_service_reason_code` (nullable, meaningful only when `is_active = false`) — back "Classification" and "End Service" UI sections that exist in source SimplePay system.

**Known schema limitation:** no multiple-employment-periods-per-person concept. Rehire employment history can't be shown — flag to Payroll chat rather than building against nonexistent data.

**Data currency:** historical payslip data imported through September 2025 ONLY. Anything after that (resignations, promotions, etc.) is not reflected. Any dashboard/report UI must visibly communicate this data boundary, not imply real-time currency.

**Design reference exists:** Real SimplePay screenshots (Employee Classification, End Service/Manage End of Service incl. Service Period History, Employer Details, Employer Filing Details, and reports: EMP201, EMP501, UIF Declaration, IT3(a)/IRP5, Salary Schedule, UI-19) were captured and discussed in a separate "Payroll planning chat." Request these from the client before designing equivalent screens from scratch.

**Do NOT assume:**
- `auth.uid()` works as-is (see bridge bug above).
- Every employee has complete classification data — most don't yet, HR is backfilling. UI must handle "not yet classified" as a legitimate state, not an error.
- `payroll_admin` and `executive` are hierarchical — currently equivalent.
- `leave_balances` is usable — intentionally not populated by this system.

**How to apply:** Before building any screen touching payroll data, check this file first — many of the client's own answers may already be here. Still outstanding as of 2026-07-19 (client to supply next session): frontend stack/framework choice, GitHub repo details (name/org/private), Supabase anon key + Firebase web config (credentials, get via env vars not chat), MVP feature scope, deployment target. See [[hae_credential_hygiene]] for the plaintext service-account key files found in the project tree that must never be committed to the new frontend repo.
