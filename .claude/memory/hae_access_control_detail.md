---
name: hae-access-control-detail
description: "Two-layer HAE access control model discovered while building the frontend gate — portal-level employees-collection email match vs. Firestore access_control/{uid} accessLevels used by security rules and synced to Supabase"
metadata: 
  node_type: memory
  type: project
  originSessionId: 716f325f-4837-47e8-beb9-029da4cd5905
  modified: 2026-07-20T18:39:16.409Z
---

Confirmed 2026-07-19 by the client (from prior Ekhaya Connect build sessions) and cross-checked against `firestore.rules` and `pp-access-control/setup-access-control.js` in [C:\HAE](C:\HAE). Refines/extends [[hae_payroll_architecture]]'s access-control section — this is the actual mechanism, not a restatement.

**Auth vs. authorization are fully separate:** Firebase Authentication (email/password is the primary method for HAE staff; Google sign-in exists but was avoided due to Firefox popup issues) only proves *who* someone is. It does NOT gate portal access by itself — anyone with a Firebase Auth account could sign in.

**Layer 1 — portal gate (are you HAE staff at all):** After login, the app queries the Firestore `employees` collection client-side for a document where the `email` field matches `firebaseUser.email`. No match → block all portal content, show "Access not authorised — contact the COO." This must be a client-side query (`where('email', '==', ...)`) because `employees` is keyed by `employeeNumber` as the document ID, not by email or uid — Firestore *security rules* can only `get()` by known path, so rules cannot themselves enforce this email match (confirmed: `firestore.rules` only requires `request.auth != null` to read `/employees/{employeeId}`, i.e. any signed-in user can read the whole collection — the gate is enforced by the frontend, not the rules).

**Confirmed working 2026-07-20:** built the Layer 1 gate against the `email` field and verified end-to-end with a real HAE account signing into the local dev app — landed on the authenticated portal home page, so `employees.email` is the correct field name and the client-side query pattern works as described.

**`EMP0000` explained, 2026-07-20 — intentional CEO access record, not stale/placeholder data as earlier assumed:** client confirmed `employees/EMP0000` in Firestore was deliberately created for the CEO's system access, and the CEO has no real SimplePay/payroll record (correctly has no matching row in `payroll.employees` in Supabase — that's by design, not a bug, "leave it as is"). **However:** the client's own login (`shakabornman@gmail.com`) is the account that resolved to `EMP0000` during the RLS bridge test — meaning that email is currently set as `EMP0000`'s `email` field in Firestore. Client flagged this as a potential issue if true (their real SimplePay identity is employee `0008`, "Bomman, Johannes" — confirmed via real SimplePay screenshot, see [[hae_simplepay_design_reference]]). This is a live data question for the client/HR Portal side to resolve (is `shakabornman@gmail.com` supposed to be on the CEO's `EMP0000` record, on `0008`, or both for different reasons) — not something to silently fix from the payroll frontend, since employee data capture is explicitly HR Portal's responsibility per [[hae_payroll_screen_map]].

**Layer 2 — elevated access levels (executive/payroll_admin etc.):** Separate from Layer 1. Source of truth is `access_control/{uid}` Firestore documents (keyed by Firebase UID, not email), holding an `accessLevels` array. `firestore.rules` uses this extensively across the whole Ekhaya Connect app (values seen: `executive`, `hr`, `finance`, `nursing`, `support`, `billing`, `casem` — far more than just the payroll-relevant `executive`/`payroll_admin` from [[hae_payroll_architecture]]). This is what `syncUserAccess` Cloud Function mirrors into Supabase's `shared.user_access.access_levels` for RLS. Also carries `employeeNumber` on the access_control doc itself (used by rules to self-service-match a person's own records).

**Inconsistency spotted, not yet resolved:** `pp-access-control/setup-access-control.js` (a setup script) uses singular `accessLevel` (string, values `'executive'`/`'staff'`) when writing to `access_control/{uid}`, while `firestore.rules` reads plural `accessLevels` (array) almost everywhere. Also a legacy `employees.accessLevel` field is mentioned (single value, drove client-side nav in the old `index.html`) — a third, separate concept from both of the above. Don't assume these three are kept in sync with each other; if building anything that depends on access level, prefer reading `access_control/{uid}.accessLevels` (array) since that's what the live Firestore rules and the Supabase sync actually key off.

**No hardcoded emails, ever** — firm project-wide principle carried from the original build. Any employee/access match must be a live Firestore lookup at runtime, never a literal email string in code.

**How to apply:** When building the login → portal gate flow, implement Layer 1 (employees email match) as the first-run check right after Firebase sign-in succeeds, before rendering any portal content. Layer 2 (accessLevels) only matters once building screens that need executive/payroll_admin-gated data — read `access_control/{uid}.accessLevels`, not the legacy singular fields.
