---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-09
milestone: M3
active_work_item: SEC-010
state: synchronized-csp-validation
integration_branch: integration/electron-modernization
integration_head_commit: ef050e42a3cefa08dfecd8e4b37eb049ea72be5c
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: sec/SEC-010-shell-csp-2026-09-08
next_work_item: SEC-012
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
| Local shell | PR #42 removes eval with production/development tests | Synchronized final-head gates, then custom scheme and storage migration under SEC-010 |
| Permissions and previews | SEC-009 open; SEC-012 implementation preserved separately | Permission user-flow policy; finish preview parser/network limits and adversarial validation |
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

1. Finish synchronizing existing [CSP PR #42](https://github.com/adamlow-wire/wire-desktop/pull/42) with integration `ef050e42`; rerun local production/development startup and policy tests. Publish the final head and require build, lint, analysis, all-platform packages and authenticated Windows/macOS E2E/report before self-merge. Keep custom-scheme/state migration open.
2. Resume `sec/SEC-012-preview-fetch-2026-09-08`. Baseline commit `41882ee3` is separate. Six unfinished files are preserved in the named stash `SEC-012 preserved for CSP synchronization 2026-09-09`; inspect before restoring and drop only after successful application. No preview implementation PR is published yet.
3. Finish SEC-012: public-only HTTP(S), pinned DNS, redirect revalidation, no cookies/ambient credentials, and byte/time limits have 87 focused passing tests. A subsequently added hostile metadata-key test **fails**: the old parser mutates an inherited built-in function. Replace that parser, preserve required metadata, test parsing limits and revalidate the branch. This is not green or complete yet.
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
