# Electron modernization project

This directory is the durable project memory for replacing Wire Desktop's legacy Electron security boundary and moving to a continuously supported Electron release.

## Start here

Read in this order:

1. [Current status](./status.md) — where work stopped and what is executable next.
2. [Authoritative plan](./plan.md) — scope, priorities, dependencies, gates, risks, and decisions.
3. [Testing strategy](./testing.md) — baseline-first characterization and security testing rules.
4. [Capability matrix](./capabilities.md) — product behavior that must be understood and protected.
5. [Architecture decisions](./decisions/README.md) — detailed ADRs for choices referenced by the plan.

M0 evidence:

- [Fork and integration workflow](./governance.md)
- [Legacy baseline](./baseline.md)
- [Desktop threat model](./threat-model.md)
- [Electron compatibility inventory](./electron-compatibility.md)

Repository-wide agent instructions are in [`AGENTS.md`](../../AGENTS.md).

## Sources of truth

| Concern                                       | Authoritative location                                |
| --------------------------------------------- | ----------------------------------------------------- |
| Project scope and priority                    | `plan.md`, sections 7 and 10                          |
| Non-negotiable security behavior              | `plan.md`, section 5                                  |
| Current work and handoff                      | `status.md`                                           |
| Required product behavior and test confidence | `capabilities.md`                                     |
| Test construction and evidence                | `testing.md`                                          |
| Architectural rationale                       | `decisions/`                                          |
| Code review evidence                          | Pull requests and CI runs linked from the plan/status |

Do not duplicate status across documents. The plan describes intended work; `status.md` describes the present moment; the capability matrix describes behavioral confidence.

## Project principles

- Upgrade urgency and architectural safety are both P0. A newer Electron alone does not make the wrapper secure.
- Characterize required behavior before replacing its implementation.
- Test externally visible contracts, security policy, and platform outcomes rather than private implementation shape unless no stable seam exists yet.
- Every security boundary needs allow-path and deny-path evidence.
- Keep changes narrow, reviewable, and attributable to stable work item IDs.
- Prefer removing privilege and complexity over adding defensive layers around unnecessary privilege.
- Keep repository documentation concise. Durable decisions and results belong here; exploratory transcripts and generated reports do not.

## Resume protocol

When resuming after a gap:

1. Confirm the current branch, commit, remotes, and worktree state.
2. Read `status.md` and verify its recorded commit still matches history.
3. Refresh the latest stable Electron version if runtime work is involved.
4. Select the first unblocked work item whose dependencies are complete.
5. Re-run the narrow baseline relevant to that item before editing.
6. Update `status.md` and evidence links before handoff.

If the status file is stale, reconstruct state from git history and CI, update it, and record the correction in its handoff notes before implementation continues.
