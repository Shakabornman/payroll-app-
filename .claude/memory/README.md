# Claude Code memory backup — HAE Payroll project

This repo is a versioned backup of Claude Code's persistent memory for the
HAE Payroll project (currently `D:\HAE` on Windows). It is **not** part of
the payroll-app codebase itself — that lives at
https://github.com/Shakabornman/payroll-app-.

## What's here

Plain markdown files Claude writes to as it learns things about this
project across sessions — architecture notes, screen map, access control
details, SimplePay design reference, etc. `MEMORY.md` is the index.

## How it's managed

- Working copy: `C:\Users\ShakaB\.claude\projects\D--HAE\memory\` (this
  folder) — Claude Code reads/writes here directly during normal work.
- Backup remote: `D:\claude-memory-backups\hae-payroll-memory.git` (a bare
  repo on the shared data partition, reachable from both the Windows and
  Linux Mint installs since it's on `D:\`).
- Claude auto-commits and pushes to the remote after meaningful memory
  updates, without asking each time (standing permission granted
  2026-07-25).

## Using this on Linux Mint

Claude Code on Linux will generate its **own**, differently-named project
memory folder the first time you open this project there (the folder name
is derived from whatever path you open the project at, e.g. a mount point
like `/mnt/data/HAE` — it won't automatically be called `D--HAE` again).

To bring this backed-up memory into that new Linux-side folder:

```bash
# Find where Claude Code created the (likely empty) new memory folder first,
# e.g. ~/.claude/projects/<encoded-path>/memory/ - then:
git clone /path/to/shared/partition/claude-memory-backups/hae-payroll-memory.git /tmp/hae-memory-restore
cp /tmp/hae-memory-restore/*.md ~/.claude/projects/<encoded-path>/memory/
```

Adjust the shared-partition mount path for however Linux Mint actually
mounts the `D:\` partition (check `lsblk` / `/etc/fstab` if unsure).
