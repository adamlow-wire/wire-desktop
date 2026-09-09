---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-09
milestone: M3
active_work_item: CAP-001
state: production-account-cutover
integration_branch: integration/electron-modernization
integration_head_commit: d94253c9937c6e0bac256fc49e4980af00dd6e91
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: cap/CAP-001-production-accounts-2026-09-09
next_work_item: SEC-007
blockers: []
---

# Current project status

## Milestone checkpoint

M0, M1 and M2 exit gates are complete. **M3 is not complete: approximately 65%**, an engineering estimate, not a measured acceptance percentage or time forecast. Electron remains **43.4.0** under DEC-007; Electron 44 is deferred. M1 completion does not close the broader ELC-003 dependency audit.

| Area | Verified integration state | Remaining M3 acceptance |
| --- | --- | --- |
| IPC/isolation | SEC-002–006 merged: registered authority, typed contracts, no remote dependency, isolated bridges and sandboxing | Preserve invariants during production cutover |
| Accounts | Opt-in main-owned collection, targeted deletion, metadata identity protection | Complete and qualify production CAP-001/SEC-007 cutover in draft PR #47 |
| Navigation/links | PRs #38/#39 enforce navigation, popup, external-link and incoming parsing | Main-authorized custom backends and lifecycle/account routing under SEC-008/SEC-013/CAP-005/CAP-006 |
| Local shell | CSP PR #42 removes production/development eval | SEC-010 custom scheme and storage migration |
| Permissions/previews | SEC-012 preview policy merged in PR #44 | SEC-009 authorized permission user flows |
| Critical capabilities | SSO PR #43 and download containment PR #45 merged | Controlled live IdP checkpoint, certificate/configuration policy, deep-link/single-instance parity |
| Closure | Not started | Requirement-by-requirement M3 audit and final cross-platform evidence |

## Active work and next executable steps

**[Draft PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47), CAP-001**, targets integration directly. It is not ready to merge. Latest runtime checkpoint: `f6604dd5`; subsequent changes add restart readiness checks and update this handoff.

Implemented on the draft branch:

- Main-owned versioned profile/state and native `WebContentsView` accounts preserve legacy default and `persist:UUID` sessions. Production uses named shell controls, without JSX webviews or shell webview privileges.
- Native metadata, menus, edit/account shortcuts, reload/About, SSO initiation and bounded startup/desktop queues preserve ordered login/join/location delivery and account readiness. Main-owned App-lock arguments avoid premature synchronous preload IPC without relaxing origin checks.
- Removal revokes/closes the exact view before session and strict log cleanup; errors retain the profile record for retry. Browser data, HTTP credentials and connections are cleared on the target session only. The obsolete production deletion binder/capability is retired; a read-only handler check verifies absence.
- Failed account addition hides old content instead of showing it under the new selection; retry and switching back preserve identities. Bootstrap and sidebar tests protect named selection and keyboard-menu focus.

Next work, without creating overlapping plan items:

1. Complete localized environment approval and main-owned programmatic destination policy; audit remaining lifecycle/error UI paths. Resolve residual partition-directory disposition: browser-visible deletion across restart is proven locally, but raw Chromium directories remain. Do not blindly remove a live partition or the default user-data directory.
2. Qualify PR #47 on its final head. The expanded Windows/Linux account gates passed at `604908f4`; macOS failed an earlier secure-shell test before reaching them. Diagnose any recurring failure from its actual stage; do not waive assertions or increase deadlines without evidence.
3. Finish SEC-009 permission user flows, SEC-010 local scheme, SEC-008/SEC-013 follow-ups and CAP-005/CAP-006 certificate/configuration/link acceptance. Permission default-denial alone is not calling parity.
4. Obtain CAP-002 controlled live IdP evidence, then audit every M3 criterion and complete final package/authenticated E2E/review gates. Signed installer/update qualification remains M4/M5, not an additional M3 signing prerequisite.

## Current validation

| Check | Latest local result | Evidence |
| --- | --- | --- |
| Electron main | 732 passing, zero pending | `/tmp/cap001-final-main-coverage.log` |
| Electron renderer | 4 passing | `/tmp/cap001-final-renderer-coverage.log` |
| React | 111 passing, 27 suites | `/tmp/cap001-final-react-coverage.log` |
| Changed-code coverage | 718/897 statements **80.04%**, required 80%; security branches 15/15 **100%**, required 90% | `/tmp/cap001-final-diff.log`, runtime head `f6604dd5` |
| Application and Mocha types | Both pass as separate commands | `test:types`, `build:ts:tests`; `/tmp/cap001-final-*-types.log` |
| Changed-source lint/builds | Pass | `/tmp/cap001-final-lint.log`, `/tmp/cap001-final-build.log` |
| Rebuilt lifecycle and metadata/restart | **6/6 in 39.3 seconds**, three repetitions, Linux | `/tmp/cap001-restart-readiness-repeated.log` |
| Standalone Playwright types | Nine known unrelated errors, not green | Two `window.wire` declarations and seven generated-client body types; `/tmp/cap001-restart-readiness-types.log` |

Coverage was regenerated from a clean directory after an interrupted process and its temporary logs disappeared. Partial output was discarded. Local `--project=macOS` is a Playwright label and remains **Linux evidence**. Temporary logs are diagnostic aids, not substitutes for durable final-head CI links.

Recent sensitivity/diagnosis:

- Old cleanup retained HTTP credentials. Six native tests cover credentials, cookies, local storage, IndexedDB, Cache Storage, failures and retries; omitting storage clearing causes three failures.
- Product restart tests seed both sessions and verify removed/retained data after actual app exit/relaunch. A cookies/cache-only cleanup leaves target local storage/IndexedDB and fails the new assertions. Persistent cookies have explicit expiries; session cookies are not expected to survive exit.
- Add-failure regression first observed the old view still visible. Wrong-account bootstrap routing and disabled sidebar focus restoration each fail their UI target. All mutations are restored.
- After environment resumption, immediate main-process evaluation on restart stalled in both product fixtures. A private D-Bus/runtime-directory experiment did not fix it. Applying the existing initial-launch shell-ready check to **both restarts** yields 6/6 passing repetitions, without changing storage assertions, sandboxing or deadlines. Earlier failures: `/tmp/cap001-final-product.log`, `/tmp/cap001-private-session-product.log`, `/tmp/cap001-shell-ready-product.log`.
- `test:types` checks application types only. Earlier combined “application/Mocha” claims without `build:ts:tests` were incorrect. The hosted `31ce8019` startup-queue `never[]` error reproduced locally and was fixed with an equivalent zero-length assertion.

Hosted gates are not yet final-head qualification:

- At `e6ffe767`, [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34366758797/job/102517347917) passed tests but failed statements at 77.90%; the new local tests raise this above the unchanged threshold.
- At `604908f4`, [Windows and Linux packages/account gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34367710882) passed. The earlier Windows two-second controller setup/teardown timeout did not recur; no timeout change was made.
- [macOS at that head](https://github.com/adamlow-wire/wire-desktop/actions/runs/34367710882/job/102520621936) timed out in the existing secure-shell popup/navigation/permission test **before** the expanded account step. This is not a macOS account-cleanup assertion failure. Lint/analysis passed; draft-skipped E2E is not a pass or waiver.

## Durable merged evidence and history

- [PR #45](https://github.com/adamlow-wire/wire-desktop/pull/45), `d94253c9`: download containment; final head `858643d6` passed [build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34337480573), [packages including Windows junction denial](https://github.com/adamlow-wire/wire-desktop/actions/runs/34337480574), and [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34337502792). Certificate/configuration acceptance remains open.
- [PR #44](https://github.com/adamlow-wire/wire-desktop/pull/44), `62435cc6`: SEC-012 complete after [build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34333303038), [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34333303096), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34333303173), and review checks passed.
- [PR #46](https://github.com/adamlow-wire/wire-desktop/pull/46), `6f256d59`: isolated legacy-profile seeding; [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34329710696) and [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34329781004) pass, with two disclosed macOS multi-account retry passes. Product shutdown was not weakened.
- [PR #42](https://github.com/adamlow-wire/wire-desktop/pull/42), `9c188bf1`: CSP final [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374305) and [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374718) pass; custom scheme remains open.
- [PR #43](https://github.com/adamlow-wire/wire-desktop/pull/43), `ef050e42`: native SSO completion final [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239220276) and [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239266392) pass; ordinary login does not establish live IdP completion.
- Earlier work-item evidence remains in [the plan](./plan.md). The detailed CAP-001 checkpoint chronology is preserved in [committed status at 604908f4](https://github.com/adamlow-wire/wire-desktop/blob/604908f46dba04d3bd2e359d151631dfacfcd3bd/docs/electron-modernization/status.md), not duplicated as stale next-step instructions here.

## Maintainer input and operating constraints

- No immediate input is needed for executable code work. Live SSO needs a dedicated staging SSO code/IdP identity or maintainer-run evidence; never paste credentials into chat/logs. Existing vault values work. Do not recreate credential normalization, Jira dependencies or production-test workarounds.
- PR-only integration and self-merge authorization remain in force. Require every applicable final-head check and substantive review resolution; no admin bypass and no merge of this unfinished draft.
- Native GUI suites run **serially**. Complete `build:ts` **and** `bundle` before product tests; never rebuild during them. Preserve `chromiumSandbox: true` and unset `ELECTRON_RUN_AS_NODE` for native tests.
- Clear coverage before aggregating changed sources; diff coverage evaluates **committed HEAD**. Commands: `clear:coverage`, React coverage with `--modulePathIgnorePatterns='<rootDir>/wrap/'`, serial main/renderer coverage, `coverage:report`, then `DIFF_COVERAGE_BASE=fork/integration/electron-modernization corepack yarn coverage:diff`.
- Preserve `wrap/worktrees/wpb-5221-deployment-audit` and existing MSI artifacts. Never run local `build:prepare` or `clear:wrap`. Use tracked-file formatting inputs if the broad formatter glob encounters the existing restricted MSI artifact; do not change its permissions or delete it.
- Renderer-loss tests terminate only their verified fixture renderer PID. Do not invoke the retired destructive deletion channel as a probe; use the read-only handler-presence assertion. An additional webview-enablement mutation was rejected and restored; no such execution is claimed.
- The unlimited M3 goal remains active. Completion requires plan acceptance, not a goal record, passing narrow tests or a numerical estimate.
