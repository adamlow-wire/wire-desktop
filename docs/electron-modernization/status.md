---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-20
milestone: M0
active_work_item: BASE-001
state: awaiting-e2e-vault-access
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: BASE-001
blockers:
  - Access to the Test Automation 1Password vault is pending so the three exact staging values can replace the incorrect fork secrets
  - TST-002 still requires a controlled SSO integration fixture before M0 can close
  - PR #1 must be reviewed and merged by the solo maintainer after the remaining M0 evidence is recorded
  - Linux packaging reproducibly fails while rebuilding the Windows-only registry-js module
---

# Current project status

## Current outcome

The protected integration branch intentionally remains at the recorded upstream base. The 13 M0 commits are on `ci/m0-package-baseline-portability` and enter integration only through [PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1). Obsolete credential-workaround [PR #2](https://github.com/adamlow-wire/wire-desktop/pull/2) was closed without merge and its branch was deleted. M0 is not complete: BASE-001 is waiting for a valid staging E2E run, TST-002 still lacks its controlled SSO fixture, and the remaining review-dependent M0 items are accepted only when the maintainer merges PR #1.

## Active work

| Field               | Value                                                                        |
| ------------------- | ---------------------------------------------------------------------------- |
| Work item           | BASE-001 — Capture a reproducible legacy baseline                            |
| Owner               | `adamlow-wire`                                                               |
| Branch              | `ci/m0-package-baseline-portability`                                         |
| Goal                | Obtain the authoritative staging values and complete the legacy E2E baseline |
| Completion evidence | Passing Windows/macOS E2E run using the exact Test Automation vault values   |

## Next executable sequence

1. After access to the `Test Automation` vault is granted, copy the `BackendConnection staging` fields into `E2E_WEBAPP_URL`, `E2E_BACKEND_URL`, and `E2E_BACKEND_BASIC_AUTH` without placing values in source or chat.
2. Add `run-e2e` to PR #1, classify any genuine product failures, and retain the Windows/macOS result.
3. Complete the remaining TST-002 controlled SSO fixture and perform the M0 exit review.
4. Review and merge PR #1; this records acceptance of BASE-002, ARC-001, and SEC-001 and places the M0 commits on the integration branch.
5. Begin ELC-002 with an isolated 38→39 upgrade PR. The known Linux packaging defect remains assigned to PKG-001.

## Completed work

| Work item                                               | Evidence                                          |
| ------------------------------------------------------- | ------------------------------------------------- |
| GOV-001 — Establish fork and integration workflow       | GitHub API readback on 2026-08-18                 |
| GOV-003 — Establish durable human and AI project memory | Commit `567be7646a61fdd725f7fdb693880a294d65d155` |
| ELC-001 — Inventory Electron compatibility blockers     | `electron-compatibility.md`                       |
| TST-001 — Make coverage reporting accurate              | Commits `c27cfa6a`, `d96baaad`                    |

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
| Development E2E | Run `32190461891` built and launched on Windows/macOS, then all 30 tests failed because the configured normal Wire login was rejected by the protected activation-code endpoint; authoritative vault values pending | 2026-08-19 |

## Handoff notes

- Do not claim independent review in the solo-maintainer model. The maintainer's PR merge is the recorded product/security/architecture decision.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- The Linux build command is not trustworthy until it propagates package errors and artifact existence is checked.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- PR #2 was intentionally closed without merge on 2026-08-20. Do not recreate its credential normalizer or preflight unless evidence from the authoritative vault value demonstrates a real defect.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
