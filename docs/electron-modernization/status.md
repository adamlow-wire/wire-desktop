---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-20
milestone: M1
active_work_item: ELC-002
state: m1-in-progress
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
integration_head_commit: 6a406dbdd474114fd3e3031091569e579ec606df
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: ELC-002
blockers: []
---

# Current project status

## Current outcome

M0 is merged through [PR #5](https://github.com/adamlow-wire/wire-desktop/pull/5). M1 is active in [PR #6](https://github.com/adamlow-wire/wire-desktop/pull/6): Electron is pinned directly from `38.8.6` to the revalidated latest stable `43.4.0`. The first hosted run exposed the known Linux false-green as a real M1 blocker: builder 25.1.8 could not resolve Electron 43's ABI and the wrapper swallowed the error. The branch now updates the packaging toolchain, propagates failures, and makes missing artifacts fatal; clean platform reruns are pending.

## Active work

| Field               | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Work item           | ELC-002 — Upgrade Electron to latest stable                                  |
| Owner               | `adamlow-wire`                                                               |
| Active branch       | `upgrade/ELC-002-electron-43`                                                |
| Goal                | Prove the direct Electron 38.8.6→43.4.0 transition                           |
| Completion evidence | Local baseline plus clean Windows/macOS/Linux package and required E2E gates |

## Next executable sequence

1. Open the ELC-002 PR and run all clean-checkout required checks.
2. Require Windows and macOS packaged launch smoke plus the existing authenticated E2E matrix.
3. Merge only when Electron `43.4.0` remains latest stable and every required result is green.
4. Begin the bounded M2 secure single-account shell proof on a new branch; keep the three legacy SSO targets under CAP-002.

## Completed work

| Work item                                               | Evidence                                          |
| ------------------------------------------------------- | ------------------------------------------------- |
| GOV-001 — Establish fork and integration workflow       | GitHub API readback on 2026-08-18                 |
| GOV-003 — Establish durable human and AI project memory | Commit `567be7646a61fdd725f7fdb693880a294d65d155` |
| ELC-001 — Inventory Electron compatibility blockers     | `electron-compatibility.md`                       |
| TST-001 — Make coverage reporting accurate              | Commits `c27cfa6a`, `d96baaad`                    |
| BASE-001 — Capture a reproducible legacy baseline       | PR #3 run `32364188026`                           |
| BASE-002 — Create the capability acceptance matrix      | PR #1                                             |
| ARC-001 — Approve target process and view architecture  | ADR 0001; PR #1                                   |
| SEC-001 — Threat model the desktop wrapper              | `threat-model.md`; PR #1                          |
| TST-002 — Characterize enterprise SSO                   | 18 passing / 3 CAP-002 security targets pending   |

## Last verified state

| Check | Result | Date |
| --- | --- | --- |
| Plan formatting | `prettier --check` passed | 2026-08-20 |
| Work item identifiers | Unique | 2026-08-18 |
| Work item dependencies | All identifiers resolve; graph is acyclic | 2026-08-18 |
| Integration publication | Branch pushed to `adamlow-wire` fork | 2026-08-18 |
| Integration protection | PR required with zero external approvals; strict required checks, no admin bypass/force push/deletion, conversation resolution; API read back | 2026-08-18 |
| Application and test types | Passed | 2026-08-20 |
| Legacy development build | Passed | 2026-08-20 |
| Jest baseline | 14 suites / 36 tests passed | 2026-08-20 |
| Electron main baseline | 54 passed / 3 CAP-002 targets pending; first run hit the known tray focus flake and the unchanged rerun passed | 2026-08-20 |
| Electron renderer baseline | 2 tests passed | 2026-08-20 |
| Build-tool baseline | 13 tests passed | 2026-08-20 |
| SSO characterization | 18 passed / 3 CAP-002 security targets pending; new error tests sensitivity-proven | 2026-08-20 |
| Coverage pipeline | 46 main/preload + 32 local-renderer files; pass | 2026-08-18 |
| Linux AppImage baseline | PR #6 first run confirmed builder 25.1.8 could not resolve Electron 43 ABI and incorrectly exited 0; repair and fatal artifact gate pending rerun | 2026-08-20 |
| Windows/macOS packages | Development package and launch smoke passed in PR #1 CI | 2026-08-18 |
| Development E2E | Run `32364188026`: Windows/macOS jobs passed; merged report 57 expected, 3 unrelated flaky, 0 unexpected; all group-call/logout cases passed first attempt | 2026-08-20 |
| Electron 43 local compatibility | Runtime `v43.4.0`; types/build passed; Jest 14/36, main 54 + 3 pending, renderer 2, build tools 13 all passed | 2026-08-20 |

## Handoff notes

- Do not claim independent review in the solo-maintainer model. The maintainer's PR merge is the recorded product/security/architecture decision.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- PR #6 contains a sensitivity-proven regression test for Linux packaging error propagation; do not restore the prior catch-and-log behavior.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- PR #2 was intentionally closed without merge on 2026-08-20. Do not recreate its credential normalizer or preflight unless evidence from the authoritative vault value demonstrates a real defect.
- The authoritative `BackendConnection staging` values work. Do not add credential normalization or workarounds without new evidence of a credential defect.
- Local Linux is useful for build/unit/integration filtering but cannot currently replace the hosted E2E gate: the wrapper opens and the expected `<webview>` page is not surfaced as a second Playwright window.
- Existing ignored validation worktrees under `wrap/` are user artifacts. Preserve them and exclude `wrap/` when invoking Jest locally; clean CI checkouts do not contain them.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
