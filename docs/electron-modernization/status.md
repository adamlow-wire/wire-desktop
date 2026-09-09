---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-09
milestone: M3
active_work_item: CAP-001
state: production-account-cutover
integration_branch: integration/electron-modernization
integration_head_commit: 9c188bf1891fd9179d447acd5fcc6df857afec4f
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: cap/CAP-001-production-accounts-2026-09-09
next_work_item: SEC-007
blockers: []
---

# Current project status

## Milestone checkpoint

M0, M1 and M2 exit gates are complete. **M3 is not complete.** Electron stays at `43.4.0` under DEC-007; Electron 44 is intentionally deferred. The M1 runtime gate does not imply the broader ELC-003 dependency audit is complete.

| Area | Verified state | Remaining M3 acceptance |
| --- | --- | --- |
| IPC/isolation | SEC-002–006 merged: registered authority, typed contracts, no remote dependency, isolated bridges and sandboxing | Preserve invariants during production cutover |
| Production accounts | Opt-in main-owned collection and targeted deletion; metadata identity protected | SEC-007/CAP-001 production WebContentsView, main-owned state, lifecycle routing and legacy sessions |
| Navigation/links | PRs #38/#39 merged: strict navigation, popup, external and incoming-link parsing | Main-authorized custom-backend changes and lifecycle/account routing under SEC-008/SEC-013/CAP-005/CAP-006 |
| Local shell | CSP PR #42 merged: production/development eval removed | SEC-010 custom scheme and storage migration |
| Permissions/previews | SEC-009 open; SEC-012 implemented in PR #44 | Permission user-flow policy; final-head preview E2E/report |
| Critical capabilities | SSO PR #43 merged with all three quarantines removed; download containment in draft #45 | Controlled live IdP checkpoint, certificate/configuration policy and deep-link/single-instance parity |
| Closure | Not started | Audit every M3 acceptance criterion and final cross-platform evidence |

The previously communicated approximately 65% was an engineering estimate, not a measured acceptance percentage or time forecast. PR counts are not a completion metric.

## Merged evidence

- [PR #42](https://github.com/adamlow-wire/wire-desktop/pull/42), CSP, merged `9c188bf1`: final-head build/lint/analysis, [all-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374305) and [Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374718) passed naturally. Production/development startup and ordinary-script eval/Function denial have sensitivity evidence. Custom-scheme acceptance remains open.
- [PR #43](https://github.com/adamlow-wire/wire-desktop/pull/43), native SSO completion, merged `ef050e42`: [build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239220717), [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239220276), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239266392) all green. One-use callback secret, allowlist and cookie-scope mutations failed before restoration. The resolved CodeQL redirect comment concerns the deliberate loopback backend fixture; no production exemption or suppression was added. Ordinary login E2E does not prove live IdP completion.
- Earlier PRs #37–41 cover sandboxing, navigation/parser, renderer-loss test harness and metadata identity. Their final-head evidence remains in the plan and linked PRs; no claim that the production view migration is already complete.

## Active branches and next executable work

1. **[Draft PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47), CAP-001**, is stacked on draft #45; do not publish their changes as a duplicate integration diff. Baseline commit `6d20d3fa` adds actual sandboxed account switching, exact-account join/logout routing, add/cancel and removal with cross-account cookie retention. Baseline and restored run each pass in 4.6 seconds. Inverting the actual preload target identity makes the unchanged test fail. The fixture correctly observes join as a DOM CustomEvent, not amplify publish. Profile groundwork is committed as `11b3e46b`; account production behavior is unchanged so far. Next: implement the SEC-007/CAP-001 production view/state cutover, preserving existing default and `persist:UUID` sessions.
2. **[PR #44](https://github.com/adamlow-wire/wire-desktop/pull/44), SEC-012**, head `8a7af56b2726a73266623aa30b2e6a9036f96760`, includes merged CSP. [Build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34325903430), lint, analysis and [all-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34325903440) pass, but [E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/34325903416) failed macOS worker teardown again; Windows passed. **[PR #46](https://github.com/adamlow-wire/wire-desktop/pull/46)** isolates the legacy-profile seed without changing product shutdown. Its head `1a87fc83` passes build/lint/analysis/all-platform packages; [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34329781004) is pending. After #46 passes and merges, synchronize #44 and require all new final-head gates and reviewed comments before self-merge. No unchanged-head retry.
3. **[Draft PR #45](https://github.com/adamlow-wire/wire-desktop/pull/45), CAP-005 download containment**, branch `cap/CAP-005-download-path-2026-09-09`, is based on PR #44, not integration. Implementation `ca1b8e22`, handoff `d25151d6`. [Native package preflight](https://github.com/adamlow-wire/wire-desktop/actions/runs/34327126999) runs at the implementation commit and includes a real Windows junction test; this is not final-head acceptance for the later handoff commit. After #44 merges, retarget #45 to integration, make it ready and require applicable final-head gates before self-merge.
4. Finish SEC-010 local-scheme migration, SEC-009 permissions, SEC-008/SEC-013 follow-ups and CAP-005/CAP-006 parity. Download containment does not close certificate policy or platform managed-config backend coverage.
5. Complete CAP-002 live-provider evidence and the M3 closure audit. Do not mark M3 complete while any required acceptance remains open.

## Local validation and known failures

- **CAP-001 main state owner:** `AccountState` now owns generated identities, selection, unfinished-login reuse and account-limit enforcement. Display snapshots omit session IDs and pending SSO/join secrets; failed saves do not publish transient state. Seven owner tests plus a real-file restart integration test pass. Exposing session IDs and publishing before the write produce two expected failures; restored before commit. Full main suite: 632 passing, zero pending; application/Mocha types and targeted lint pass. Owner coverage: 39/39 statements and 16/16 branches. The next implementation step is authorized guest/shell commands and production view integration; no new IPC or runtime cutover is active yet.
- **CAP-001 groundwork at `11b3e46b`:** rebuilt TypeScript and bundled preloads; 624 main (zero pending), 4 renderer, 97 React and 38 tooling tests pass. Own diff versus #45: 88/90 statements (97.78%). Profile module: 64/64 statements and 34/34 branches; native reader: 24/26 statements and 9/10 branches. Sandbox product lifecycle and metadata/restart checks pass 2/2 in 8.7 seconds on Linux. These results validate the current preparation, not future production wiring.
- **Immediate CI diagnosis:** PR #44 final-head Windows E2E passes but macOS again fails worker teardown. The downloaded trace locates the stall at the first `app.close()` in `accountMetadata.spec.ts:74`, before metadata assertions, used solely to prepare the legacy profile. PR #46 contains the isolated seeding fixture; its Windows E2E job now passes and macOS remains running. No blind rerun or production shutdown change. PR #45 native preflight passes all platforms, including the real Windows junction test.
- **CAP-001 preparation:** the four `electron/src/accounts/` files are restored to the active branch; the recovery stash was successfully applied and dropped. Profile validation covers exact legacy mappings, case-aliased partition rejection, unreadable/corrupt state and atomic-write failure preservation. The read-only migration reader uses the exact frame's storage key and supplied session, with page scripts/Node/webviews disabled; native tests cover preferences, retained cookies, isolated sessions, bounded reads, failed-read distinction and complete window destruction. Combined profile/reader run passes 26 tests. Temporarily enabling page scripts fails the preference assertion; removing durable-write synchronization and relaxing the read-size limit produce two expected failures. All guards are restored. Types and targeted lint pass. Commands: `corepack yarn test:types`, `corepack yarn build:ts:tests`, `env -u ELECTRON_RUN_AS_NODE corepack yarn test:main --grep 'main-owned account profile|legacy account profile reader'`. These modules are **not wired into production** yet; production migration acceptance remains open.
- **CAP-001 migration fixture:** old-profile setup now runs a sandboxed, JavaScript-disabled file-origin window without loading the current application/migration logic. Both account lifecycle and metadata/restart baselines pass (8.6 seconds; restored run 7.9 seconds). Changing the stored key so legacy state is absent makes both fail; restored before commit. This prepares real one-time migration testing without changing product runtime or weakening the existing assertions.
- **SEC-012:** separate baselines `41882ee3`/`b31f4b60`, implementation `6d7760fc`. Old transport fails five private-fetch targets; old parser fails inherited-object mutation. Title mutation fails three compatibility tests; private-address/DNS-pinning/compressed-wire mutations cause 22 failures. All restored. Synchronized full suite: 530 main (zero pending), 4 renderer, 97 React, 38 tools; application/Mocha types and lint pass. Diff: 176/180 statements (97.78%), 114/121 security branches (94.21%). Actual sandboxed metadata/navigation pass 2/2 in 7.9 seconds; cleanup passes in 2.0 seconds on Linux.
- **SEC-012 initial CI failure:** head `9d25f910` passed Windows E2E, but [macOS](https://github.com/adamlow-wire/wire-desktop/actions/runs/34322872580/job/102373295119) failed with a 90-second worker-teardown timeout. Metadata restart, account search and authenticated-page timeouts passed on built-in retry (31 passed, 3 flaky). Do not attribute this to staging without evidence. No unchanged-head rerun was requested; the synchronized head requires fresh gates.
- **CAP-005:** baseline `08135866`: 6 pass, skipped-preparation mutation gives 3 failures, restored baseline passes. Five unsafe-path targets fail on old code. Link-denial mutations fail; independently removing download-start revalidation gives one expected failure. All restored. Full suite: 598 main (zero pending), 4 renderer, 97 React, 38 tools; types/lint/formatting pass. Standalone diff vs #44: 39/47 statements (82.98%), 23/23 security branches (100%); integration diff: 215/227 statements (94.71%), 137/144 branches (95.14%). Sandbox product metadata/navigation/cleanup: 3/3 in 9.3 seconds on Linux. Native preflight passes all platforms; [Windows job](https://github.com/adamlow-wire/wire-desktop/actions/runs/34327126999/job/102386861788) explicitly passes the real junction test. Retargeted final-head acceptance is still required.
- Commands: `corepack yarn build:ts && corepack yarn bundle`; `test:types`; `build:ts:tests`; fresh `test:main:coverage`, `test:renderer:coverage`, `test:react:coverage --modulePathIgnorePatterns '<rootDir>/wrap/'`, `test:bin`, `coverage:report`; `DIFF_COVERAGE_BASE=fork/integration/electron-modernization corepack yarn coverage:diff`. CAP-005 standalone coverage uses `DIFF_COVERAGE_BASE=sec/SEC-012-preview-fetch-2026-09-08`. Product checks use `test:e2e --project=macOS` with the named regression specs; that local label is **Linux evidence**, not macOS.

## Maintainer input and operational constraints

- No immediate input is needed for executable work. Controlled live SSO needs a staging SSO code and dedicated IdP test identity, or maintainer-run evidence. Never paste credentials into chat/logs. Signing is M5, not ordinary testing.
- PR-only integration and self-merge authorization remain in force. Require every applicable final-head check, including checks not enforced by protection; no admin bypass. Review substantive comments before resolving.
- Run native GUI suites serially. After branch switches rebuild TypeScript **and** bundled preloads before product tests; never rebuild during a suite. Preserve `chromiumSandbox: true`.
- Clear coverage before aggregating changed sources; diff coverage evaluates committed HEAD. Exclude `wrap/` from Jest. Preserve user worktree `wrap/worktrees/wpb-5221-deployment-audit`; never run local `build:prepare` or `clear:wrap`.
- Standalone Playwright types retain nine known generated-client/`window.wire` errors; not a green check. Metadata-fixture startup/quit stalls are not claimed fixed. Renderer-loss tests terminate only their verified renderer PID to avoid host dump delays.
- Vault values work. Do not recreate credential normalization, Jira dependencies or production-test credential workarounds. MSI is integrated.
- On September 9 the missing conversation goal was recreated at the maintainer's request. The goal is active; completion is governed by plan acceptance, not the goal record.
