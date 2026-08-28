---
name: hae-frontend-decisions
description: Chosen frontend stack and repo for the HAE HR Payroll frontend
metadata: 
  node_type: memory
  type: project
  originSessionId: 716f325f-4837-47e8-beb9-029da4cd5905
  modified: 2026-07-19T20:13:19.461Z
---

Frontend stack decided 2026-07-19: Node.js/JavaScript (not TypeScript) + shadcn/ui component library. Framework assumed to be Next.js (App Router) since it's the natural pairing for shadcn/ui and was the earlier recommendation the client didn't push back on — reconfirm with client if this proves wrong.

GitHub repo: https://github.com/Shakabornman/payroll-app- (note: repo name has a trailing hyphen, confirmed as given, not a typo to "fix").

No server-side secret keys needed in this frontend: Firebase web config and Supabase anon/publishable key are both designed to be public/client-safe, protected by Firebase Auth rules and Supabase RLS respectively (see [[hae_payroll_architecture]] for the RLS auth-bridge bug to verify). Env vars therefore all use the `NEXT_PUBLIC_` prefix and can be set via `.env.local` (gitignored) with an `.env.example` template committed instead.

**How to apply:** Use these exact stack/repo facts when scaffolding or referencing the frontend project — don't ask the client to re-confirm framework/repo unless something contradicts this.
