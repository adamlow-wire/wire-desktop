---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-18
milestone: M0
active_work_item: BASE-001
state: blocked-on-valid-internal-backend-credential
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: BASE-001
blockers:
  - The configured E2E_BACKEND_BASIC_AUTH value is syntactically valid but staging rejects it with HTTP 401
  - PR #1 must be merged by the solo maintainer after E2E evidence is reviewed
  - PR #2 must be reviewed and merged into the M0 branch before PR #1
  - Linux packaging reproducibly fails while rebuilding the Windows-only registry-js module
---

# Current project status

## Current outcome

The active integration branch was recreated at the recorded upstream base so every modernization commit enters through [PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1). The project uses a solo-maintainer, AI-assisted model: the PR, strict automated checks, explicit test evidence, and the maintainer's merge decision replace unavailable multi-person approvals without claiming independent review. [PR #2](https://github.com/adamlow-wire/wire-desktop/pull/2) fixes raw Basic-auth normalization and adds a read-only preflight. The preflight proves that the configured value has a supported format but staging rejects it with HTTP 401. M0 is not closed until a valid internal staging credential produces an E2E baseline and the maintainer reviews and merges the stacked PRs.

## Active work

| Field               | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Work item           | BASE-001 — Capture a reproducible legacy baseline                                           |
| Owner               | `adamlow-wire`                                                                              |
| Branch              | `test/BASE-001-e2e-auth-preflight`                                                          |
| Goal                | Validate the internal staging credential, complete E2E evidence, and merge PR #2 then PR #1 |
| Completion evidence | Required CI, package/E2E runs, and the solo maintainer's recorded merge decision            |

## Next executable sequence

1. Replace `E2E_BACKEND_BASIC_AUTH` with the exact internal staging API credential represented by `op://Test Automation/BackendConnection staging/basicAuth`; a normal Wire E2E account is not sufficient.
2. Re-run [PR #2](https://github.com/adamlow-wire/wire-desktop/pull/2) with `run-e2e`; review and merge PR #2 into the M0 branch after Windows and macOS pass.
3. Review and merge PR #1 once the required checks and acceptable baseline evidence are present.
4. Begin ELC-002 with an isolated 38→39 upgrade PR; fix the Linux packaging defect under PKG-001 rather than hiding it in the baseline.

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
| Development E2E | Fork injection, builds, and app launch work on Windows/macOS; all 30 tests then fail at Brig activation with HTTP 401. [PR #2 preflight](https://github.com/adamlow-wire/wire-desktop/actions/runs/32193043318) independently confirms the configured internal credential is rejected on both platforms. | 2026-08-18 |

## Handoff notes

- Do not claim independent review in the solo-maintainer model. The maintainer's PR merge is the recorded product/security/architecture decision.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- The Linux build command is not trustworthy until it propagates package errors and artifact existence is checked.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- Do not bypass or skip the internal API preflight to manufacture a green E2E result. Obtain the `BackendConnection staging/basicAuth` value, configure it privately, and rerun PR #2.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
