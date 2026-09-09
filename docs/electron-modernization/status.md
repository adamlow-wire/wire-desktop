---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-09
milestone: M3
active_work_item: SEC-012
state: preview-synchronized-validation
integration_branch: integration/electron-modernization
integration_head_commit: 9c188bf1891fd9179d447acd5fcc6df857afec4f
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: sec/SEC-012-preview-fetch-2026-09-08
next_work_item: SEC-007
blockers: []
---

# Current project status

## Outcome and remaining gates

M0, M1 and M2 exit gates are complete. **M3 is not complete.** Electron stays at `43.4.0` under DEC-007; Electron 44 is intentionally deferred. The M1 runtime exit gate does not imply the broader ELC-003 dependency-audit work is complete.

| M3 checkpoint | Verified state | Remaining acceptance |
| --- | --- | --- |
| IPC and renderer isolation | SEC-002–006 merged: registered authority, typed contracts, no remote dependency, isolated bridges and sandboxing | Maintain invariants through production view migration |
| Production secure shell | Opt-in main-owned collection and targeted deletion; production metadata identity protected | SEC-007/CAP-001 production WebContentsView, main-owned state, lifecycle routing and legacy-session preservation |
| Navigation and links | PRs #38/#39 merged: strict navigation, popup, external and incoming-link parsing | Main-authorized custom-backend changes and lifecycle/account routing under SEC-008/SEC-013/CAP-005/CAP-006 |
| Local shell | PR #42 merged: eval removed with production/development tests | Custom scheme and storage migration under SEC-010 |
| Permissions and previews | SEC-009 open; SEC-012 implemented in PR #44 | Permission user-flow policy; synchronized final-head preview validation |
| Critical capabilities | PR #43 fixes isolated SSO completion and removes all three SSO test quarantines | Controlled live IdP checkpoint, certificate/configuration policy and deep-link/single-instance parity |
| Closure | Not started | Audit every M3 acceptance criterion; final cross-platform package and authenticated E2E evidence |

Do not use PR counts as a completion metric. The previously communicated approximately 65% was an engineering estimate, not a measured acceptance percentage or time forecast.

## Latest merged evidence

All entries passed applicable final-head gates before merge. Historical details remain in the linked PRs and plan.

| PR | Outcome | Durable validation |
| --- | --- | --- |
| [#37](https://github.com/adamlow-wire/wire-desktop/pull/37) | SEC-006 sandboxing, merge `5926e3d0` | [Packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34212873453), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34212873692) |
| [#38](https://github.com/adamlow-wire/wire-desktop/pull/38) | Navigation/window policy, merge `67dfb5db` | [Build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34228799065), [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34228800662), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34228799004); no final rerun |
| [#39](https://github.com/adamlow-wire/wire-desktop/pull/39) | Incoming-link parser, merge `75b22ded` | [Packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34223325572), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34223325647); one unchanged Windows rerun after proxy fixture timeout |
| [#40](https://github.com/adamlow-wire/wire-desktop/pull/40) | Renderer-loss test harness, merge `cc8fc01d`; runtime unchanged | [Packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34227062520); E2E deferred under DEC-008 |
| [#41](https://github.com/adamlow-wire/wire-desktop/pull/41) | Metadata/cross-account mutation protection, merge `ebda3707` | [Build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34234893145), [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34234893191), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34234966274); no rerun |
| [#43](https://github.com/adamlow-wire/wire-desktop/pull/43) | Isolated native SSO completion, merge `ef050e42` on September 9 | [Build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239220717), [packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239220276), [E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239266392); all final-head checks green |

PR #43 local combined validation: 431 native tests, zero pending; 94 React, 4 renderer, 35 tools; application/Mocha types, lint and changed statements 66/69 (95.65%) pass. Three sandboxed product regressions pass. One-use secret, callback allowlist and cookie-domain mutations failed before restoration. The reviewed CodeQL redirect comment concerns the deliberately backend-compatible loopback test fixture only; no production exemption or analysis suppression was added. Ordinary authenticated E2E does not prove live IdP completion.

## Next executable work

PR #44 synchronized with merged CSP on September 9: 530 main tests (zero pending), 4 renderer, 97 React and 38 tools pass. Application/Mocha types and fresh diff coverage pass: 176/180 changed statements (97.78%) and 114/121 security branches (94.21%). The synchronized head still requires hosted gates; initial-head results do not substitute for them.

Rebuilt sandboxed product metadata/navigation tests pass 2/2 in 7.9 seconds, and the separately invoked `fixtureCleanup.spec.ts` passes in 2.0 seconds on Linux. CAP-001 lifecycle baseline is committed separately as `6d20d3fa` on `cap/CAP-001-production-accounts-2026-09-09`; routing perturbation failed and restoration passed before commit. Do not lose that branch when synchronizing dependencies.

1. [CSP PR #42](https://github.com/adamlow-wire/wire-desktop/pull/42) merged as `9c188bf1` after final-head build, lint, analysis, [all-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374305) and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374718) passed naturally. Keep custom-scheme/state migration open.
2. [SEC-012 PR #44](https://github.com/adamlow-wire/wire-desktop/pull/44), initial head `9d25f910`, passed build, lint, analysis, all-platform packages and Windows E2E. Initial [macOS E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/34322872580/job/102373295119) failed with a 90-second worker-teardown timeout; metadata restart, account search and authenticated-page timeouts passed on built-in retry (31 passed, 3 flaky). Do not claim that run green or attribute it to staging without evidence. The active branch incorporates merged CSP and requires fresh final-head gates; no unchanged-head rerun was requested. Baselines `41882ee3` and `b31f4b60` precede implementation `6d7760fc`; the recovery stash is restored and removed.
3. Publish SEC-012 after final committed-diff validation. The old parser's inherited-object mutation is reproduced and fixed; public-only transport and bounded metadata collection pass the full local suite: 528 main (zero pending), 4 renderer, 94 React and 35 tools. Application/Mocha types and changed-file lint pass. New security branch coverage: parser 48/50 (96%), destination policy 19/20 (95%), fetch 47/51 (92.16%). Private-address, DNS-pinning and compressed wire-limit perturbations produce 22 expected failures; all are restored. Hosted gates remain open. The committed SEC-012 diff passes 176/180 statements (97.78%) and 114/121 changed security branches (94.21%). Rebuilt sandboxed product regressions pass 3/3 in 12.6 seconds on Linux, including actual page-to-main preview rejection with zero local-target requests. Commands: `corepack yarn test:main:coverage`, `corepack yarn test:renderer:coverage`, `corepack yarn test:react:coverage --modulePathIgnorePatterns '<rootDir>/wrap/'`, `corepack yarn test:bin`, `DIFF_COVERAGE_BASE=fork/integration/electron-modernization corepack yarn coverage:diff`, and `corepack yarn test:e2e --project=macOS` with the metadata/navigation/cleanup specs. The project label is not macOS evidence.

4. Execute production account/view/state cutover under SEC-007/CAP-001 and local-scheme migration under SEC-010, preserving existing default and `persist:UUID` sessions. Close SEC-009, SEC-008/SEC-013 follow-ups and CAP-005/CAP-006 parity.
5. Complete CAP-002 live-provider evidence and the M3 closure audit. Do not mark M3 complete while any acceptance or required platform evidence remains open.

## Maintainer input and operational constraints

- No immediate input is needed for the executable work above. Controlled live SSO needs a staging SSO code and dedicated IdP test identity, or maintainer-run evidence. Do not paste credentials into chat or logs. Signing is M5, not ordinary local testing.
- PR-only integration and self-merge authorization remain in force. Require **all applicable final-head checks**, even checks not enforced by protection; no admin bypass. Review substantive comments before resolving them.
- Run native GUI suites serially. After branch switches run `corepack yarn build:ts && corepack yarn bundle` together before product/preload tests; never rebuild during a suite. Preserve product `chromiumSandbox: true`.
- Local Playwright's `macOS` label executes Linux here; do not claim macOS evidence from it. Standalone Playwright types retain nine known generated-client/`window.wire` errors, not a green check.
- Clear coverage before aggregating changed sources; diff coverage evaluates committed HEAD against integration. Exclude `wrap/` from local Jest. Preserve user worktree `wrap/worktrees/wpb-5221-deployment-audit`; never run local `build:prepare` or `clear:wrap`.
- Known local metadata-fixture startup/quit stalls were not claimed fixed; hosted PR #41 passed without reruns. Renderer-loss tests avoid host crash-dump delays by terminating only their verified renderer PID.
- Authoritative vault values work. Do not recreate credential normalization, Jira dependencies or production-test credential workarounds. MSI is integrated, not a pending feature branch.

## Reconciliation note

On September 9 the conversation goal was absent and was recreated at the maintainer's explicit request. GitHub state and final-head checks were read back; PR #43 merged normally. This file replaces stale active-PR and pending-test claims with verified state. Goal completion is governed by the plan's acceptance criteria, not the goal record.
