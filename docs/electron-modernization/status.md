---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-14
milestone: M3
active_work_item: CAP-005
state: preparing-existing-managed-backend-candidate
integration_branch: integration/electron-modernization
integration_head_commit: d94253c9937c6e0bac256fc49e4980af00dd6e91
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: cap/CAP-005-managed-backends-2026-09-10
next_work_item: SEC-010
blockers:
  - live-sso-e2ei-provider-configuration-pending
  - certificate-exception-policy-pending
---

# Current project status

## Current execution

A real two-account HTTP proxy fixture confirms a second CAP-005 defect: submitting the native prompt for the non-default account authenticates its request but changes the unrelated default session from `DIRECT` to the proxy. The clean failing product baseline is `e2e-tests/specs/regression/proxySession.spec.ts`; `/tmp/m3-proxy-session-baseline.log` records the exact unrelated-session assertion failure. Only synthetic loopback credentials are used. Bind proxy application and cancellation reload to the challenged web contents before qualifying this candidate.

A compatibility/security-target fixture now launches the normal application executable from an external Node driver, using only an isolated loopback page and fresh profile. It checks main-owned account identity, the immutable configuration value and denied page Node globals without inspector access, injected preload, product test flags or relaxed fuses. The native/package workflow runs the packaged executable before and after a test-owned App-lock policy value is installed through the actual OS backend (Linux file, Windows per-user registry, macOS app defaults), then removes only that value. Existing policy is never overwritten. This covers backend delivery and restart, not MDM deployment or authenticated proxy behavior. Native platform/package results remain pending. Local driver qualification passes against the rebuilt development app; removing the actual configuration exposure fails the expected assertions and restoration passes. A false managed-value expectation also fails. Commands/logs are recorded in testing.md. Normal shutdown is covered separately by the account fixture; this external startup driver terminates only its own process tree during cleanup.

PR #47 is now at `78231f74`, with explicit normal native-quit/exit assertions in the metadata fixture and metadata/restart added to its early platform gate after Windows worker-teardown failures at `b46b0858`. Reconcile those changes before publishing this candidate. No final-head gate is inherited.

A fresh source review reproduced unsafe machine endpoint fallback after registry dependency/read failure: both new targets select the CLI URL instead of refusing it (`/tmp/m3-registry-fallback-before.log`). The separate failing baseline is `24cd61b4`. The implementation treats these failures as configured-invalid; thirteen focused reader/environment tests pass after restoring denial, and Mocha types/lint pass. Normal absence remains supported. The combined backend/central/IPC/reader group passes 47 cases. Temporarily restoring the old failure classification makes both new targets fail; restored denial passes both (`/tmp/m3-registry-fallback-sensitivity{,-restored}.log`). This is now a runtime security fix requiring full final-head platform and authenticated E2E gates, not a tests-only exception.

This existing CAP-005 backend branch is reconciled with account head `b46b0858` while PR #47 qualifies. No new branch or PR is created. Its original backend tests and string-hive typing are preserved; a new native Windows registry test is prepared separately. It uses one random test-owned HKLM leaf, the real registry-js module and production configuration/destination functions; valid machine policy wins over user/CLI URLs, and foreign/invalid destinations reject before any dialog. Cleanup removes only that leaf. The Windows gate temporarily removes the actual builder guard, requires its specific assertion failure, restores the source, then requires the unchanged fixture to pass. Native Windows evidence is still pending. TypeScript/bundle, Mocha types, lint and 45 focused Linux native backend/configuration/IPC cases pass (`/tmp/m3-backends-{build,types,lint,native}.log`). Linux execution does not qualify the Windows-only case. Integration remains unchanged. Publish this scoped candidate only after the account dependency merges and its final base is reconciled.

M3 remains incomplete. Seven of sixteen work items are marked done; nine remain open. This is an item count, not a weighted completion percentage. Electron is pinned to **43.4.0**. No acceptance requirement or invariant is waived. The maintainer authorizes scoped publication and self-merge after substantive review and all applicable final-head checks pass.

[PR #48](https://github.com/adamlow-wire/wire-desktop/pull/48) merged into the existing CAP-001 branch as `8c64d2490b081df312ef1717d5551d82ecd37417` after substantive review and every applicable final-head check passed. Protected integration remains `d94253c9`; the production cutover is not merged there yet. Managed destination baseline `6d7b2aa2` is preserved as a separate cherry-pick, followed by the reviewed enforcement delta from `3b906fe7` with current documentation reconciled.

Next: qualify the combined production-account cutover in existing [PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47), including the reconciled managed-destination policy, against protected integration. Require native/package checks on Windows/macOS/Linux and full authenticated Windows/macOS E2E/report on its final head. Then integrate this CAP-005 fail-closed registry candidate, followed by SEC-010 protocol and lifecycle work. Do not create more parallel branches or merge unqualified candidates.

## Objective acceptance audit

September 14 restart independently verified integration `d94253c9`, PR #47 then draft at `23fb964b`, local account `a4ce662c` and permission `3f41dd7b`, actual candidate diffs, workflow results and dedicated-provider secret-name inventory. Old draft E2E skips did not qualify the cutover. GitHub access works. Live upstream dev is `d2124109267b1c9bf483866d96fca193fe27b7d7`, seventeen commits beyond recorded upstream `6f9b6a99`; no unrelated upstream synchronization was mixed into M3.

| Open item | Implemented or prepared | Remaining acceptance |
| --- | --- | --- |
| CAP-001 | PRs #8/#10/#41 integrate account selection/cleanup/metadata foundations. PR #47 activates main-owned views, exact-target removal/retry, preserved partitions, routing and approved backend changes. | Final cutover critical/regression multi-account, cross-account IPC/session isolation and exact-target cleanup/restart qualification, then merge. No forensic-erasure requirement is inferred. |
| SEC-007 | PR #47 removes production webview elements/popups and disables webview tags; native lifecycle fixtures cover selection/layout/recovery. | Final cutover source audit and supported-platform resize/focus/hide/show/crash/reload/add/remove/switch/storage evidence. |
| SEC-009 | PR #48 supplies separate document-scoped notification/audio/video native consent, abort/revocation and desktop-thumbnail denial. | Integration through #47 and final permission qualification. The authoritative CAP-003 register assigns enabling display sharing to M4; M3 retains display/thumbnail/empty-media-type denial. Native allow/deny and authenticated calling evidence is recorded below. |
| SEC-008 | PR #38 integrates navigation/popup/SSO/PiP/external boundaries. Prepared managed-destination policy is reconciled into #47. | Final programmatic destination/approval qualification; configured foreign/invalid origins must fail before navigation, prompt or profile replacement. |
| SEC-010 | PR #42 integrates no-eval CSP. Existing `2ce86631` supplies seven-resource custom protocol and conditional legacy-state migration. | Reconcile current composition/docs, qualify scheme privileges/CSP/migration and native/package startup, review and merge. |
| CAP-005 | PRs #16/#25/#31/#45 integrate immutable config, proxy identity and download containment. Existing backend/certificate candidates remain available. | Resolve Q-005 global pin override; qualify chosen fail-closed certificate behavior, native backend/proxy/config paths and Windows machine-policy-to-product behavior. |
| SEC-013 | PRs #39/#38 integrate bounded incoming/external parsing; account cutover and lifecycle candidate supply delivery. | Valid/hostile startup, running and second-instance exact-account delivery without arbitrary navigation or recursion. |
| CAP-006 | Existing `6902448a` prevents ordinary Windows secondary instances from persisting stale settings and adds real child-process coverage. | Reconcile the short profile in its fixture, qualify exact-target delivery/exit natively on Windows and supported OS paths, merge. |
| CAP-002 | PR #43 integrates isolated SSO, one-use native callback, scoped cookie transfer and backend verdicts. `44f8a9ed` adds fixtures only; no E2EI implementation. | Dedicated live SSO plus OIDC/ACME E2EI enrolment, verified device/certificate state and restart, renewal/fallback, cancellation/provider failure and cross-account denial on supported platforms. Transport fixtures are insufficient. |

## PR #48 qualification and review

Reviewed code head `f3d538cf0fa1999cb55b5f3e077ffc80aa53e835`, base `a4ce662c23e4d90e8321f0753d54bc7bcd3a4d3d`:

- [Build/test/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34824213936), [lint](https://github.com/adamlow-wire/wire-desktop/actions/runs/34824213940), [analysis](https://github.com/adamlow-wire/wire-desktop/actions/runs/34824213929), and [all three native/package jobs](https://github.com/adamlow-wire/wire-desktop/actions/runs/34824213920) pass. Platform jobs include permission/session/native-dialog cancellation and real product storage deletion/restart.
- [Authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34824671929) pass: macOS 39 passes/one retry pass (login page closed); Windows 37 passes/three retry passes (logout login, group-member search, two-account badge count one instead of two). All forty cases per platform eventually pass; no skips. The badge assertion retry remains a CAP-001 qualification concern, not merely setup failure.
- Source review covers permission policy/session/consent, controller/view composition, isolated preload event and test-only launcher. Authorization is rechecked after asynchronous consent; unknown scopes/subframes fail closed; checks do not prompt; revocation settles callbacks once; disposal installs deny handlers. No production permission-handler replacement or plaintext storage fallback exists.
- A distinct security finding reproduced unconsented thumbnail enumeration using an inert enumerator. Capability removal makes the same product assertion reject with zero enumeration before/after device consent. No host desktop was captured. Deliberately disabling real account context isolation fails the corrected native-view sandbox assertion; production perturbations were restored.
- Windows storage seeding passes with a short test-owned profile and unchanged deletion/restart assertions. The exact cause of the old opaque error is unproven; path length is an inference. Linux CI configures only the pinned sandbox helper as root/4755. Only controller fixture setup/teardown budgets increase from two to ten seconds after repeated native-renderer startup timeouts; security test-body and consent deadlines are unchanged.
- Earlier failed-head [E2E run 34819682745](https://github.com/adamlow-wire/wire-desktop/actions/runs/34819682745) had obsolete sandbox expectations and repeated Windows storage seeding failure. Earlier macOS secure-shell denial timed out at two seconds and passed one unchanged failed-job rerun. These attempts are retained, not represented as final qualification.

## Prepared integration deltas

No new branches were created for preparation. This existing backend branch uses `/tmp/m3-cap005-packaged`; preserve it and the protected MSI worktree.

| Existing candidate | Reconciled local evidence and next use |
| --- | --- |
| Managed destinations `2fdf3aba` | Baseline `6d7b2aa2` fails four locale/SSO perturbations; enforcement `3b906fe7` fails both native targets when its guard is removed, then passes restored. Retained logs: `/tmp/cap001-destination-sensitivity.log`, `/tmp/cap001-managed-controller-sensitivity.log`; focused guard coverage was 28/28 statements and 26/26 branches. Combined permission+destination code builds, passes 58 focused native tests and two real lifecycle/permission product fixtures. `/tmp/m3-managed-destinations.patch` contains the reviewed source/MSI-contract delta. |
| Protocol `2ce86631` | `/tmp/m3-protocol-reconciled.patch` is protocol-only relative to f3+managed. Builds/types/lint pass; full native 821/821, direct secure-shell command 27/27, eight product fixtures pass. Missing ignored configured logos initially caused two temporary-checkout failures; copying normal postinstall assets restored them without source changes. Preserve the already recorded September 10 bounded source review; do not count repeating it as new progress. Reconcile proposed ADR 0003 and current docs when publishing. |
| Lifecycle `6902448a` | `/tmp/m3-lifecycle-reconciled.patch` is lifecycle-only relative to f3+managed+protocol, with secondary process using the same short profile. Builds/types/lint pass; 52 focused native tests and actual Linux second-process/storage/restart flow pass. Native Windows remains required in the scoped PR. |
| Managed backends `78d09079` | Existing representative Linux/macOS/Windows adapter tests and corrected registry-js string hive typing. Preserve original tests; hosted/native qualification still required. |
| Certificates `ad1211cd` | Characterization and fail-closed callback handling exist, but process-global pin bypass remains. Resolve Q-005 before acceptance. |
| E2EI `44f8a9ed` | Native navigation/SSO fixture repair reused by #48. Remaining transport fixture preserves same-origin session storage and denies foreign providers; it does not prove issuance or renewal. |

## Linux evidence and limits

A private temporary D-Bus/GNOME keyring now supplies `gnome_libsecret` with encryption available and a successful synthetic round trip. Distro binaries are extracted under `/tmp/m3-native-keyring`; no host keyring or system package installation was changed. The random unlock password is stdin-only. The wrapper runs tests with isolated mode-0700 XDG directories and plaintext storage disabled.

Fresh native 785/785, React 112/27 suites, synthetic media 4/4, renderer 4/4 and seven rebuilt product fixtures pass at recorded checkpoints. Authenticated multi-account/logout/calling batch gives 9 passes and one initial-login timeout before active removal; the unchanged focused removal passes in 41.7s. Full supplemental Linux execution gives **36 passing / 4 failing**: corrected sandbox expectation, separately passing non-macOS localization expectation, and two app-badge assertions. The native probe reports `unity:false`, badge update false/count zero; Electron 43.4.0 requires Unity for Linux badges. This host cannot qualify those assertions. Historical `--project=macOS` selectors do not make Linux execution macOS evidence.

Application and Mocha types pass. Standalone Playwright types retain **nine existing errors**: two conflicting window.wire declarations and seven generated API body types; none are in the changed fixtures. Do not claim that gate is green.

Detailed commands/sensitivity and earlier chronology remain in `git show f3d538cf:docs/electron-modernization/status.md`, testing.md and the PR body. Local logs use `/tmp/m3-*`; they may disappear and do not replace durable hosted evidence.

## Required decisions and access

Two questions sent September 14 remain pending; do not repeat or infer approval from elapsed time. A fresh register audit resolves the earlier display question: CAP-003 explicitly assigns enabling display sharing to M4, while SEC-009/M3 requires permission enforcement. Correcting later notes that promoted a chooser to an M3 blocker changes no scope, criterion or invariant. Native display/thumbnail denial remains required.

- Q-005: remove manual pinning override (recommended), or retain exact-certificate/hostname/account-session restart-cleared exceptions. Chromium verification errors remain denied either way.
- Q-011: dedicated staging SSO/E2EI team, OIDC and ACME nonsecret configuration plus approved credential location, or explicit authorization to provision an isolated test team. No shared/prod identities or credentials in source/chat.

The sibling webapp uses OIDC `shouldBeRedirectedByProxy`, but no deployed same-origin proxy configuration is established. Foreign account OIDC navigation is currently denied. Provider compatibility requires implementation evidence, not merely a password or a transport fixture. Webapp/core retain OIDC, ACME and cryptographic ownership.

## Operating rules

One primary work item per PR; integration PR-only; substantive review and applicable final-head checks before self-merge. Preserve user edits, `wrap/worktrees/wpb-5221-deployment-audit` and MSI artifacts. No broad cleanup, `clear:wrap` or local `build:prepare`. Native GUI suites run serially; build TypeScript then bundle before product tests. Never capture real devices/screens, modify trust stores or weaken an invariant for a pass. Signed installers/updates and independent release review remain M4–M6. Final M3 closure requires every acceptance criterion on the integrated head with durable PR/CI evidence.
