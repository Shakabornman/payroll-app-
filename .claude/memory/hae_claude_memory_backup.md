---
name: hae-claude-memory-backup
description: "Where and how this Claude Code memory folder itself is backed up (git repo on the shared D:/data partition), standing permission for auto-commit/push, and the Windows+Linux dual-boot working-copy paths"
metadata: 
  node_type: memory
  type: reference
  originSessionId: dcc9f214-22c8-487e-b27c-ca59a5c586be
  modified: 2026-07-27T11:03:28.065Z
---

The user moved their HAE project from `C:\HAE` to `D:\HAE` (2026-07-25) as part of a new Windows 11 / Linux Mint dual-boot setup with a shared data partition (`D:\` on Windows). Claude Code's project-memory folder is keyed by absolute project path, so the move auto-created a fresh, empty `D--HAE` memory folder on Windows — the old `C--HAE` one (same content, now stale) still exists at `C:\Users\ShakaB\.claude\projects\C--HAE\memory\` as a fallback but is no longer the active one.

**This memory folder is a git repo**, backed up to a bare repo on the shared partition: `D:\claude-memory-backups\hae-payroll-memory.git` on Windows, reachable from Linux Mint at `/mnt/data/claude-memory-backups/hae-payroll-memory.git` (same physical partition, different mount path per OS). Chosen deliberately local-only (not GitHub) — user's preference, 2026-07-25 — since it's on the shared drive, both installs can reach it without needing a remote git host.

**Working copies, one per OS (project path differs, so Claude Code gives each its own memory folder):**
- Windows: `C:\Users\ShakaB\.claude\projects\D--HAE\memory\`
- Linux Mint: `/home/shakab/.claude/projects/-mnt-data-HAE-payroll-app/memory/` — restored from the bare repo 2026-07-27 (this folder is keyed off `/mnt/data/HAE/payroll-app`, the payroll-app frontend repo path, not `/mnt/data/HAE` — different from the Windows key). Initialized as its own git repo here with `origin` set to the bare repo path above and `main` tracking `origin/main`, so it behaves the same as the Windows working copy going forward.

Both working copies push to and pull from the same bare repo, so they can drift if edited on both OSes without syncing in between — no automatic merge, just whichever pushed last wins unless someone pulls first. Not a real problem yet since usage is expected to alternate, not run concurrently.

**Auto-pull-on-session-start, set up 2026-07-27 (Linux side only so far):** a `SessionStart` hook in this project's `.claude/settings.local.json` (gitignored, machine-local — not the checked-in `.claude/settings.json`, since the memory folder's absolute path is OS-specific) runs `git -C /home/shakab/.claude/projects/-mnt-data-HAE-payroll-app/memory pull --ff-only origin main` at the start of every session, silently, so a Linux session never starts on memory that's stale relative to a Windows push. Deliberately `--ff-only`, not a merge/rebase — if the pull isn't a clean fast-forward (e.g. an unpushed local commit exists), the hook does nothing destructive and instead emits a `systemMessage` flagging that memory may be out of sync and needs manual attention, surfaced to the user/Claude at session start. Pushing after edits was already covered by the standing permission above (Claude does it itself, not a hook) — this hook only closes the *pull* side of the gap.

**Windows-side hook done, 2026-07-27.** `D:\HAE\.claude\settings.local.json` now has the matching `SessionStart` hook, `"shell": "powershell"`, same command and fail-soft pattern as the Linux one. Verified two ways before writing it: piped a real successful no-op pull (silent, exit 0) and a real divergent-history pull (created an actual unpushed local commit plus a separate remote commit via a temp clone, confirmed the hook emits a `systemMessage` JSON and does NOT merge/rebase, then fully cleaned up both the working copy and the bare repo back to their prior state). Both OSes now auto-pull memory at session start.

**Standing permission granted 2026-07-25 (Windows), carried forward to Linux 2026-07-27:** auto-commit and push to this backup remote after meaningful memory updates, without asking each time, on either OS — this is different from the payroll-app code repo, where push still requires per-instance confirmation. Revoke by telling Claude to stop.

**Note:** there was briefly a second, unrelated `D:\.claude\` folder (drive root) containing what looked like a manual/independent copy of the whole global Claude config — user confirmed 2026-07-25 this was their own reference copy, not used by Claude Code itself (which reads from `C:\Users\ShakaB\.claude\`, confirmed via `CLAUDE_CODE_EXECPATH`), and said they'd delete it themselves. Not to be confused with the deliberate backup repo described above.

**How to apply:** After any session that adds or meaningfully edits memory files, run `git add -A && git commit -m "..." && git push` in this folder without asking first, on whichever OS the session is running on. If a working copy's history has diverged from `origin/main` (e.g. switched OS without pushing last time), pull/rebase before pushing rather than force-pushing over the other OS's edits — check with the user if it's not a clean fast-forward.
