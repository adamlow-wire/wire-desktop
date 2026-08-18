---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-18
milestone: M0
active_work_item: GOV-001
state: blocked-on-external-controls
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: GOV-001
blockers:
  - GOV-001 requires hosted branch protection and required checks; GitHub CLI authentication must be renewed
  - BASE-001 requires verified Windows, macOS, and Linux package/launch evidence and available E2E credentials
  - BASE-002, SEC-001, and ARC-001 require named Wire product, security, and platform approvers
  - Q-001, Q-002, Q-006, Q-008, and Q-009 require project-sponsor decisions
---

# Current project status

## Current outcome

All locally actionable M0 controls are implemented: the legacy baseline is recorded, coverage is accurate and gated for changed/security code, SSO has a passing deterministic characterization suite with known security failures explicitly quarantined, the capability acceptance matrix is detailed, and the threat model, Electron 38-to-43 inventory, governance procedure, and target architecture ADR exist. M0 is not closed: hosted controls, cross-platform package evidence, named approvals, and product/platform scope decisions require Wire authority or infrastructure.

## Active work

| Field               | Value                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Work item           | M0 exit gate                                                                                 |
| Owner               | `adamlow-wire`                                                                               |
| Branch              | `integration/electron-modernization`                                                         |
| Goal                | Obtain the external controls and approvals needed to close M0 honestly                       |
| Completion evidence | Hosted branch-rule readback, cross-platform CI links/artifacts, and recorded owner approvals |

## Next executable sequence

1. Publish the M0 evidence commit and inspect `Build and Test`, `Lint`, and cross-platform baseline workflow results.
2. Renew GitHub CLI authentication, apply/read back integration-branch protection, and finish GOV-001.
3. Nominate the Q-008 owners; have Security/Product review the threat model and capability matrix and Security/Platform review ADR 0001.
4. Resolve supported OS, Linux parity, required IdPs, and fork CI credential/runners under Q-001, Q-002, Q-006, and Q-009.
5. Re-run failed/missing package and E2E evidence. When all M0 gates pass, begin ELC-002 with the 38→39 upgrade commit.

## Completed work

| Work item                                               | Evidence                                          |
| ------------------------------------------------------- | ------------------------------------------------- |
| GOV-003 — Establish durable human and AI project memory | Commit `567be7646a61fdd725f7fdb693880a294d65d155` |
| ELC-001 — Inventory Electron compatibility blockers     | `electron-compatibility.md`                       |
| TST-001 — Make coverage reporting accurate              | Commit `c27cfa6a41404f3835049d0553d6fbb7b17c4441` |

## Last verified state

| Check                      | Result                                                                   | Date       |
| -------------------------- | ------------------------------------------------------------------------ | ---------- |
| Plan formatting            | `prettier --check` passed                                                | 2026-08-18 |
| Work item identifiers      | Unique                                                                   | 2026-08-18 |
| Work item dependencies     | All identifiers resolve; graph is acyclic                                | 2026-08-18 |
| Integration publication    | Branch pushed to `adamlow-wire` fork                                     | 2026-08-18 |
| Legacy development build   | Passed                                                                   | 2026-08-18 |
| Jest baseline              | 14 suites / 36 tests passed                                              | 2026-08-18 |
| Electron main baseline     | 37 legacy tests passed                                                   | 2026-08-18 |
| Electron renderer baseline | 2 tests passed                                                           | 2026-08-18 |
| Build-tool baseline        | 13 tests passed                                                          | 2026-08-18 |
| SSO characterization       | 16 passed / 3 security targets pending                                   | 2026-08-18 |
| Coverage pipeline          | 46 main/preload + 32 local-renderer files; pass                          | 2026-08-18 |
| Linux AppImage baseline    | Failed rebuilding Windows-only `registry-js`; build incorrectly exited 0 | 2026-08-18 |
| Windows/macOS packages     | Awaiting platform workflow evidence                                      | —          |
| Development E2E            | Awaiting Wire test credentials                                           | —          |

## Handoff notes

- Do not mark M0 done from local documents alone; the external blockers in the front matter are mandatory gate evidence.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- The Linux build command is not trustworthy until it propagates package errors and artifact existence is checked.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
