---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-20
milestone: M0
active_work_item: TST-002
state: m0-sso-exit-review
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: TST-002
blockers:
  - TST-002 still requires a controlled SSO integration fixture before M0 can close
  - Stacked PRs #1 and #3 must be reviewed and merged in order by the solo maintainer
---

# Current project status

## Current outcome

BASE-001 is complete on stacked [PR #3](https://github.com/adamlow-wire/wire-desktop/pull/3). [E2E run 32364188026](https://github.com/adamlow-wire/wire-desktop/actions/runs/32364188026) passed the complete Windows and macOS jobs; every group-call and logout case passed on its first attempt. The merged report recorded 57 expected results, three unrelated known flakes, and no unexpected failures. The protected integration branch remains unchanged until the maintainer reviews and merges PR #1 followed by PR #3. M0 then requires only TST-002 reconciliation and its exit review.

## Active work

| Field               | Value                                                                               |
| ------------------- | ----------------------------------------------------------------------------------- |
| Work item           | TST-002 — Characterize enterprise SSO                                               |
| Owner               | `adamlow-wire`                                                                      |
| Next branch         | `test/TST-002-controlled-sso`                                                       |
| Goal                | Reconcile existing SSO integration evidence and fill only the remaining fixture gap |
| Completion evidence | Passing deterministic Electron integration flow plus documented sensitivity         |

## Next executable sequence

1. Review and merge PR #1, then its stacked PR #3; do not merge directly to the protected integration branch.
2. On a dedicated TST-002 branch, reconcile the existing 16-passing/3-security-target SSO suite with the controlled integration acceptance criterion and add only demonstrably missing coverage.
3. Perform the M0 exit review and record its closure through a PR.
4. Begin ELC-002 with an isolated 38→39 upgrade PR. The known Linux packaging defect remains assigned to PKG-001.

## Completed work

| Work item                                               | Evidence                                          |
| ------------------------------------------------------- | ------------------------------------------------- |
| GOV-001 — Establish fork and integration workflow       | GitHub API readback on 2026-08-18                 |
| GOV-003 — Establish durable human and AI project memory | Commit `567be7646a61fdd725f7fdb693880a294d65d155` |
| ELC-001 — Inventory Electron compatibility blockers     | `electron-compatibility.md`                       |
| TST-001 — Make coverage reporting accurate              | Commits `c27cfa6a`, `d96baaad`                    |
| BASE-001 — Capture a reproducible legacy baseline       | PR #3 run `32364188026`                           |

## Last verified state

| Check | Result | Date |
| --- | --- | --- |
| Plan formatting | `prettier --check` passed | 2026-08-18 |
| Work item identifiers | Unique | 2026-08-18 |
| Work item dependencies | All identifiers resolve; graph is acyclic | 2026-08-18 |
| Integration publication | Branch pushed to `adamlow-wire` fork | 2026-08-18 |
| Integration protection | PR required with zero external approvals; strict required checks, no admin bypass/force push/deletion, conversation resolution; API read back | 2026-08-18 |
| Legacy development build | Passed | 2026-08-18 |
| Jest baseline | 14 suites / 36 tests passed | 2026-08-18 |
| Electron main baseline | 37 legacy tests passed | 2026-08-18 |
| Electron renderer baseline | 2 tests passed | 2026-08-18 |
| Build-tool baseline | 13 tests passed | 2026-08-18 |
| SSO characterization | 16 passed / 3 security targets pending | 2026-08-18 |
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
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
