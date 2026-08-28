---
name: hae-credential-hygiene
description: Plaintext service-account/credential files scattered in the HAE project root that must never be committed to the GitHub frontend repo
metadata: 
  node_type: memory
  type: project
  originSessionId: dcc9f214-22c8-487e-b27c-ca59a5c586be
  modified: 2026-07-25T14:54:29.463Z
---

Several Firebase/Google service-account key files (plaintext JSON) exist scattered across the project root — currently [D:\HAE](D:\HAE), moved from `C:\HAE` 2026-07-25 (see [[hae_claude_memory_backup]] for the path-migration context): `hae-vuma-92fca-firebase-adminsdk-fbsvc-3ab64c45d7.json` at repo root, `pp-access-control/firebase-service-account.json`, `migrate-pp/firebase-service-account.json`, `migrate-pp/drive-service-account.json`, `imports/serviceAccountKey.json`.

**Why:** These are admin/backend credentials with elevated privileges, sitting outside any `.gitignore` scope relevant to the frontend repo. The frontend work (`payroll-app/`) is pushed to GitHub at https://github.com/Shakabornman/payroll-app-.

**How to apply:** `payroll-app/` is already its own repo, separate from the rest of the HAE tree, so this is largely resolved — but stay alert if anything ever gets restructured to include these legacy backend folders in a git-tracked directory. Only the Firebase *public web config* (apiKey, authDomain, projectId, etc.) is safe client-side — the admin SDK keys above are not.
