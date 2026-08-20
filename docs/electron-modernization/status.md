---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-20
milestone: M1
active_work_item: ELC-002
state: m0-complete
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

M0's governed-baseline exit gate is satisfied. [PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1) recorded solo-maintainer acceptance of the capability matrix, architecture, and threat model; [PR #4](https://github.com/adamlow-wire/wire-desktop/pull/4) integrated the reviewed BASE-001 stabilization. The SSO suite now has 18 passing characterizations, including a deterministic local Electron fixture, with three legacy security failures explicitly quarantined for CAP-002. M1 begins with ELC-002's isolated Electron 38→39 upgrade.

## Active work

| Field               | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| Work item           | ELC-002 — Upgrade Electron to latest stable                             |
| Owner               | `adamlow-wire`                                                          |
| Next branch         | `upgrade/ELC-002-electron-39`                                           |
| Goal                | Upgrade Electron 38→39 as one isolated, tested compatibility transition |
| Completion evidence | Baseline tests and supported-platform packages pass on Electron 39      |

## Next executable sequence

1. Review and merge the M0 closure PR.
2. Refresh the latest stable Electron reference and upstream compatibility state before runtime changes.
3. Begin ELC-002 with an isolated 38→39 upgrade PR; preserve the M0 characterization contracts unchanged.
4. Keep the known Linux packaging repair under PKG-001 and the three SSO security targets under CAP-002.

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
| Linux AppImage baseline | Failed rebuilding Windows-only `registry-js`; build incorrectly exited 0 | 2026-08-18 |
| Windows/macOS packages | Development package and launch smoke passed in PR #1 CI | 2026-08-18 |
| Development E2E | Run `32364188026`: Windows/macOS jobs passed; merged report 57 expected, 3 unrelated flaky, 0 unexpected; all group-call/logout cases passed first attempt | 2026-08-20 |

## Handoff notes

- Do not claim independent review in the solo-maintainer model. The maintainer's PR merge is the recorded product/security/architecture decision.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- The Linux build command is not trustworthy until it propagates package errors and artifact existence is checked.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- PR #2 was intentionally closed without merge on 2026-08-20. Do not recreate its credential normalizer or preflight unless evidence from the authoritative vault value demonstrates a real defect.
- The authoritative `BackendConnection staging` values work. Do not add credential normalization or workarounds without new evidence of a credential defect.
- Local Linux is useful for build/unit/integration filtering but cannot currently replace the hosted E2E gate: the wrapper opens and the expected `<webview>` page is not surfaced as a second Playwright window.
- Existing ignored validation worktrees under `wrap/` are user artifacts. Preserve them and exclude `wrap/` when invoking Jest locally; clean CI checkouts do not contain them.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
