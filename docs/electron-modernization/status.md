---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-21
milestone: M2
active_work_item: ARC-002
state: m2-in-progress
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
integration_head_commit: 37169b39c54ffdf54ff555dfe0f453568c3209e6
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: ARC-002
blockers: []
---

# Current project status

## Current outcome

M0 and M1 are complete. [PR #6](https://github.com/adamlow-wire/wire-desktop/pull/6) upgraded Electron directly from `38.8.6` to `43.4.0`, repaired fatal packaging/error gates, and passed the final Windows/macOS/Linux package baseline plus authenticated Windows/macOS E2E. M2 is active as a bounded opt-in secure single-account shell proof; the legacy product path remains unchanged until capability migration.

## Active work

| Field               | Value                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Work item           | ARC-002 — Implement the secure single-account shell proof                                 |
| Owner               | `adamlow-wire`                                                                            |
| Active branch       | `arch/ARC-002-secure-shell-proof`                                                         |
| Goal                | Prove the new renderer/view boundary behind an explicit opt-in without changing legacy UX |
| Completion evidence | Security-target tests, real Electron integration, package baseline, and legacy E2E        |

## Next executable sequence

1. Add the ARC-002 work item and tests for policy, identity, IPC, preferences, isolation, and lifecycle.
2. Prove test sensitivity with temporary fail-open/security regressions, then revert them.
3. Implement the opt-in secure shell and run real Electron integration locally.
4. Require the normal Windows/macOS/Linux package baseline and authenticated legacy E2E before merging.
5. Begin M3 with CAP-001 multi-account lifecycle; keep the three legacy SSO targets under CAP-002.

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
| ELC-002 — Upgrade Electron to latest stable             | PR #6; Electron 43.4.0; final package/E2E green   |

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
| Electron 43 final package baseline | Run `32463021013`: Windows, macOS, and Linux passed with required artifacts | 2026-08-21 |
| Electron 43 final E2E | Run `32463021040`: Windows/macOS passed; merged report 57 expected, 3 unrelated retry passes, 0 unexpected | 2026-08-21 |

## Handoff notes

- Do not claim independent review in the solo-maintainer model. The maintainer's PR merge is the recorded product/security/architecture decision.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- PR #6 contains a sensitivity-proven regression test for Linux packaging error propagation; do not restore the prior catch-and-log behavior.
- PR #6 also contains sensitivity-proven Electron 43 unread-state compatibility tests; hidden accounts may increase but not clear unread state until visible.
- ARC-002 is a proof path, not a claim that legacy `@electron/remote`, `<webview>`, or broad IPC has been removed globally. Those work items remain open until migration removes the fallback.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- PR #2 was intentionally closed without merge on 2026-08-20. Do not recreate its credential normalizer or preflight unless evidence from the authoritative vault value demonstrates a real defect.
- The authoritative `BackendConnection staging` values work. Do not add credential normalization or workarounds without new evidence of a credential defect.
- Local Linux is useful for build/unit/integration filtering but cannot currently replace the hosted E2E gate: the wrapper opens and the expected `<webview>` page is not surfaced as a second Playwright window.
- Existing ignored validation worktrees under `wrap/` are user artifacts. Preserve them and exclude `wrap/` when invoking Jest locally; clean CI checkouts do not contain them.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
