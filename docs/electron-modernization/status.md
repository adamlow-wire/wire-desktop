---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-14
milestone: M3
active_work_item: SEC-009
state: qualifying-prepared-account-cutover
integration_branch: integration/electron-modernization
integration_head_commit: d94253c9937c6e0bac256fc49e4980af00dd6e91
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: sec/SEC-009-account-permissions-2026-09-10
next_work_item: CAP-001
blockers:
  - live-sso-e2ei-provider-configuration-pending
  - certificate-exception-and-display-phase-decisions-pending
---

# Current project status

## Milestone checkpoint

M0–M2 exit gates are recorded complete. **M3 is not complete: 7 of 16 M3 work items are marked done and 9 remain open.** These vary in size and overlap; this count is not a weighted completion percentage. Retire the previous uncalibrated ~70% estimate. Report accepted criteria and remaining gates rather than inventing a replacement percentage. Electron stays **43.4.0**; 44 is deferred. No candidate below is merged or globally complete. M1 closure does not close the broader ELC-003 dependency audit.

**Approved scope:** the maintainer explicitly added E2EI enrolment/renewal to M3. CAP-002 plan revision 1.5.25, DCP-022 and Q-011 are now reconciled onto this branch from the approved scope commit `23cb717a`. The dedicated transport/SSO fixtures remain on the CAP-002 branch below. No enrolment or renewal success is claimed.

## Fresh objective audit — September 14, 07:22 UTC

Live GitHub API reads independently confirm protected integration `d94253c9` and the sole open PR [#47](https://github.com/adamlow-wire/wire-desktop/pull/47), draft at `23fb964b`. Its build/lint/analysis and [three-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34372128865) passed; [authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34372128883) were skipped. Local permission HEAD is `3f41dd7b`, with a clean worktree at audit start. The six later CAP-001 commits and permission candidate have no final-head hosted evidence. The remote-tracking CAP-001 ref is stale (`604908f4`); use the live PR SHA. No inherited percentage or blocked verdict is used.

| Open item | Integrated / actual local delta | Missing acceptance evidence and next executable action |
| --- | --- | --- |
| CAP-001 | PRs #8/#10/#41 provide selection, cleanup and metadata foundations; local `a4ce662c` activates main-owned production accounts and retains legacy partitions | Qualify critical/regression multi-account, exact-target cleanup/restart and IPC/session isolation on the cutover. Review permission/harness prerequisite through a PR into the existing account branch, then qualify PR #47 against integration. No forensic-erasure criterion is inferred from browser-data cleanup. |
| SEC-007 | Integrated shell still uses webviews; local CAP-001 removes elements/popups and disables the tag, with native lifecycle fixtures | Final-head source audit plus resize/focus/hide/show/crash/reload/add/remove/switch and storage isolation on supported platforms. Same cutover dependency as CAP-001. |
| SEC-009 | Integrated account baseline denies permissions; local policy/session/native-consent modules grant separate document-scoped notification/audio/video permissions and revoke on navigation | Qualify positive/negative native and authenticated calling paths on all platforms. Preserve empty-media-type/display denial. Display phase decision is pending; no invariant exception is proposed. |
| SEC-010 | PR #42 removes eval; local `2ce86631` supplies fixed-resource custom protocol and legacy-state reader | Reconcile after account/permission integration; test minimal privileges, CSP and native/package startup and migration on the final head. Prior source review is not repeated as new approval. |
| SEC-008 | PR #38 supplies navigation/popup/SSO/PiP/external denial; local `2fdf3aba` adds managed destination policy | Reconcile managed destination selection/approval after CAP-001 and qualify saved/changed destinations under actual native policy. Existing navigation tests do not govern programmatic loadURL. |
| CAP-005 | PRs #16/#25/#31/#45 cover immutable config, exact proxy prompt and download containment; local `ad1211cd` certificate and `78d09079` backend candidates | Certificate candidate still has process-global pin bypass: Q-005 must resolve it before acceptance. Reconcile native backend tests, scoped proxy/config/TLS qualification and platform evidence; retain Chromium rejection. |
| SEC-013 | PRs #39/#38 provide bounded incoming/external parsers; local CAP-001 and `6902448a` supply account lifecycle delivery | Qualify valid/hostile startup, running and second-instance exact-account dispatch, including native Windows; no arbitrary action/navigation or OS recursion. |
| CAP-006 | Local `6902448a` adds single-instance lifecycle tests/implementation over CAP-001 | Reconcile this existing delta after cutover; qualify pre/post-ready and second-instance delivery on actual supported OSes. Installer ownership stays PKG-002. |
| CAP-002 | PR #43 supplies isolated SSO, native verdicts and one-use callbacks; local `44f8a9ed` changes only two E2E fixtures and docs, with no E2EI implementation | Desktop currently denies foreign OIDC navigation. Define secure E2EI authentication compatibility while webapp/core own OIDC/ACME/crypto; prove enrolment, verified state/restart, cancellation/failure, renewal and account denial. Live SSO and E2EI remain distinct gates. Fork secret-name inventory has ordinary E2E connection settings only; dedicated provider/team access requested under Q-011. |

Execution order uses existing branches: permission dependency PR into CAP-001, followed by qualified CAP-001 PR #47 into integration, then existing protocol/destination/network/lifecycle candidates. All behavior-changing PRs require authenticated E2E, not skipped checks. No new parallel branch, security relaxation, signing requirement or out-of-milestone installer task is introduced by this audit.

Fresh qualification at the audited code head: `corepack yarn build:ts`, `corepack yarn bundle`, `corepack yarn test:types` and `corepack yarn build:ts:tests` pass; `env -u ELECTRON_RUN_AS_NODE corepack yarn test:main` passes 785 tests, zero pending; `corepack yarn test:react --runInBand` passes 112 tests in 27 suites. Logs are `/tmp/m3-restart-*.log`. Native execution requires host-sandbox escalation for Electron IPC; application security preferences are unchanged. GitHub PR #47 has now been fast-forward published to existing local `a4ce662c`. Required workflow PR filters now also include that exact account branch so its permission dependency receives every build/lint/analysis/package gate before merge. No merge or milestone closure has occurred.

## Resume here

**Current execution:** PR #48 qualifies the permission/harness dependency into the existing CAP-001 branch; PR #47 is now published at `a4ce662c`. Wait for final-head qualification, merge #48 only when its applicable gates pass, then apply the reviewed managed-destination delta within #47 and qualify the account cutover against integration. The isolated Linux keyring now works; dedicated SSO/E2EI and product-policy questions remain pending. The paragraphs below retain the earlier restart context, not current publication or runner state.

The previous thread goal was marked blocked on September 10. **That is historical: GitHub access works again on September 14.** A fresh session can review/publish/qualify existing candidates. Linux storage and provider/policy questions block particular acceptance paths, not all useful work. This handoff session did not restart implementation, publish, merge or rerun application tests. Follow [the fresh-session prompt](./resume-m3.md).

1. Inspect the worktree and verify local/tracking integration refs against the explicit recorded SHA; a stale local integration ref previously produced a misleading coverage failure.
2. The native sidebar helper repair below is locally qualified. The latest helper scan found an unreferenced legacy launcher but no further confirmed failure warranting another fix. Qualify the existing authenticated tests when their runner prerequisite is met, and diagnose any actual failures within CAP-001.
3. Once secure storage is available, run staging login, then calling allow/deny and multi-account tests using the general consent harness. Never count a Linux `--project=macOS` run as macOS evidence.
4. Review PR #47's unpublished CAP-001 commits and dependent permission/harness requirements before publishing. Resolve cutover dependency ordering first: a head denying required calling flows cannot pass full acceptance. Use coherent, reviewable PRs, not blind branch combination or unqualified draft merges.
5. Finish every remaining M3 gate below and perform criterion-by-criterion closure; narrow local passes are not milestone completion.

All processes from the latest checkpoint are terminal. No authenticated tests should be restarted solely to repeat the known unavailable-keyring failure.

## Verified local candidates

### September 14 revalidation

- Live API: integration remains `d94253c9937c6e0bac256fc49e4980af00dd6e91`. PR #47 is the only open fork PR, still draft at `23fb964b2f536a01d8e60fab8f284879338d3604`. Build/lint/analysis and all three package checks succeeded; authenticated E2E/report were skipped. None qualifies the newer local heads.
- Local CAP-001 has six unpublished commits: `8a58de40`, `894df496`, `94cd2a36`, `496e636a`, `f721bf5c`, `a4ce662c`. The current permission branch also contains launcher/consent/sidebar fixes and later docs. Distinguish tested code checkpoints from documentation-only descendants.
- The native storage recheck cannot connect to `/run/user/1000/bus` because the session bus socket is absent. This differs from September 10's missing service owner. No fresh Electron encryption probe or login was run. A provisioned hosted Windows/macOS runner can provide authenticated qualification without fixing this Linux host.
- Live SSO/E2EI configuration is still unestablished. E2EI has boundary fixtures, **not a completed enrolment implementation or passing enrolment/renewal flow**. This is remaining implementation and acceptance work, not just a missing password.
- Test results below are September 10 checkpoints, not fresh runs. Temporary logs may disappear; rerun relevant tests after reconciliation and retain final-head CI evidence.

### Closeout sequence

| Work items | Next outcome and missing closure proof |
| --- | --- |
| CAP-001, SEC-007 | Review unpublished cutover and reconcile minimum permission/harness prerequisites; prove multi-account/login/logout/calling, isolation/lifecycle and final-head platform checks |
| SEC-009 | Qualify native consent allow/deny and resolve display phase ambiguity; no blanket grant or replacement permission handler |
| SEC-010 | Reconcile prepared protocol candidate after its base is stable; prove scheme/CSP/migration and packaged/platform behavior |
| SEC-008, CAP-005 | Finish backend/managed destination and chosen certificate exception policy; qualify native backend/proxy/certificate paths |
| SEC-013, CAP-006 | Reconcile lifecycle candidate; prove exact-account startup/running/second-instance delivery, especially native Windows |
| CAP-002 | Preserve live SSO and implement/qualify E2EI authentication compatibility: enrolment/ACME/verified identity/restart/renewal, cancellation/failure and cross-account denial |
| All nine open items | Audit every acceptance criterion on the final integration head with reviewed merged PRs and applicable complete CI; old-head/skipped/mock results cannot stand in for full acceptance |

Keep signed installer/updater, rollout and independent review under their M4–M6 owners. Resolve ambiguous scope from the plan and maintainer decisions; do not silently waive M3 criteria. Avoid accumulating more parallel branches or isolated tests when a critical-path candidate can be integrated and qualified.

### Candidate inventory

Candidate heads were rechecked with Git on September 14. These are **local checkpoints**, not claims of remote publication or final-head CI success. Read each branch's status and diff before switching or transferring commits.

| Work | Branch | Head | Remaining qualification |
| --- | --- | --- | --- |
| Production accounts / SEC-007 | `cap/CAP-001-production-accounts-2026-09-09` | `a4ce662c` | Final product/platform gates and cutover review; draft PR #47 |
| Permission policy and general E2E harness | `sec/SEC-009-account-permissions-2026-09-10` | `ebed07a9` (latest test checkpoint; subsequent scope reconciliation is docs-only) | Authenticated calling, native OS consent, display decision and final gates |
| E2EI acceptance and native SSO fixture | `cap/CAP-002-e2ei-acceptance-2026-09-10` | `44f8a9ed` | Scoped E2EI authentication implementation, real OIDC/ACME enrolment and live SSO |
| Local-content protocol | `sec/SEC-010-local-protocol-2026-09-10` | `2ce86631` | ADR review, hosted/platform gates |
| Managed account destinations | `cap/CAP-001-managed-destinations-2026-09-10` | `2fdf3aba` | Native managed-policy and final gates |
| Certificate verification | `cap/CAP-005-certificate-verification-2026-09-10` | `ad1211cd` | Q-005 exception policy, native/platform and final gates |
| Managed-config backends | `cap/CAP-005-managed-backends-2026-09-10` | `78d09079` | Native OS policy qualification and final gates |
| Second-instance lifecycle | `cap/CAP-006-second-instance-2026-09-10` | `6902448a` | Native Windows delivery/shutdown and final gates |
| Tray fixture cleanup/focus | `tst/TST-003-tray-fixture-cleanup-2026-09-10` | `e273a5f5` | Publication/review; code already applied to SEC-009/010 |
| Optional coverage buffer | `tst/TST-001-diff-output-buffer-2026-09-10` | `de29631d` | **Parked, not an M3 prerequisite**; based on stale integration |

SEC-009, SEC-010, managed destinations and CAP-006 depend on local CAP-001. The E2EI branch starts from SEC-009 `b1846446`, before the latest general consent/storage harness changes. Certificates and managed backends start from integration. Do not blindly combine these branches: their status/plan snapshots overlap.

## Current SEC-009 behavior and evidence

The early gate at `a719bf0e` exposed two runner prerequisites in [run 34823613006](https://github.com/adamlow-wire/wire-desktop/actions/runs/34823613006): Linux aborted the sandboxed seed process because its Chromium setuid helper was not configured; Windows timed out in the controller's three-renderer `beforeEach` before reaching product storage. macOS passed product storage/restart and reached package smoke. Linux CI now sets the pinned runtime's exact `chrome-sandbox` owner/mode to root/4755; sandbox flags remain enabled. After repeated Windows setup failures at different test cases, only the controller fixture's setup/teardown budget changes from Mocha's two-second default to ten seconds. The 38 test bodies, permission-cancellation deadlines and production behavior are unchanged; a stalled fixture still fails at the bounded limit. The local controller suite passes 38 tests (`/tmp/m3-controller-fixture-budget.log`) and changed-source lint passes. This is an explicit fixture-budget correction, not another unchanged rerun or a product timing change. Full exact-head platform and authenticated gates still remain required.

At `134a4b17`, [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34819682632), lint, analysis and [all-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34819682721) pass. macOS package attempt 1 times out in the unchanged secure-shell denial test at its existing two-second deadline; one unchanged failed-job rerun passes. [macOS authenticated E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/34819682745/job/103898262808) reports 38 passes, one retry pass (archive test initial-login timeout), and one failure: the sandbox fixture still requires a `webview` after the native cutover. [Windows E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/34819682745/job/103898262539) reports 35 passes, three retry passes (logout, messaging and active-removal login setup), and two failures: the same sandbox expectation plus lifecycle storage seeding on every attempt. No merge is authorized by these incomplete gates.

The lifecycle failure occurs while seeding storage before deletion; the retained Windows trace reports only an opaque exception. Its nested report-directory profile is replaced with a short, test-owned `mkdtemp` profile, consistent with the general launcher, to avoid deeply nested Chromium CacheStorage paths. This is a candidate fixture-path diagnosis, not yet proven native Windows success. Operation-specific DOM error reporting is added without changing the storage, routing, exact-target deletion or restart assertions. Profiles are removed only after the owning app closes and the test passes; failed fixtures retain their path for diagnosis. The unchanged acceptance flow passes locally in 4.1 seconds and the final fixture in 6.7 seconds (`/tmp/m3-lifecycle-profile.log`); changed-source lint passes after formatting, and standalone Playwright types retain the same nine existing errors. The existing lifecycle product fixture now runs in every package baseline before packaging, without staging credentials. PR #48's `run-e2e` label is temporarily removed while this fast prerequisite qualifies; reapply it and require full authenticated E2E/report success on the same final head before merge. Skipped E2E is not a pass or waiver.

The sandbox fixture now selects the actual shell and its account `WebContentsView`, proves they have distinct native identities, rejects any legacy webview, and retains every existing isolation and page-Node-denial assertion. Temporarily disabling the account's real `contextIsolation` against an inert loopback page fails the intended preference assertion; the production perturbation is restored. TypeScript then bundle, changed-source lint and the restored fixture pass. Logs: `/tmp/m3-sandbox-{sensitivity,fixture-restored,fixture-lint}.log`. Electron's runtime preference inspection omits `nodeIntegrationInWorker`; the existing worker-specific security tests retain that proof rather than inventing a new observable property. Final-head hosted gates must run again for the fixture correction.

Supplemental full Linux execution gives **36 passing / 4 failing in 18.2 minutes**, with separate artifacts under `/tmp/m3-linux-full-results` and log `/tmp/m3-linux-full.log`: the same obsolete sandbox expectation, one macOS-profile localization expectation (Linux correctly displays Restart Now), and two app-icon badge assertions. The native isolated probe returns `{unity:false,setSucceeded:false,count:0}`; [Electron 43.4.0 documents Unity as the Linux badge prerequisite](https://github.com/electron/electron/blob/v43.4.0/docs/api/app.md#appsetbadgecountcount-linux-macos). This host cannot qualify those badge assertions. Account lifecycle, metadata/restart, navigation/SSO boundary, permissions, all removal variants, calling and account notification targeting pass. This is Linux evidence only and is not a clean full-suite claim. The failed localization case passes unchanged in 32.1 seconds using its existing non-macOS expectation (`--project=windows`, still Linux execution; `/tmp/m3-linux-localization.log`). No product behavior or assertion is relaxed.

Upstream audit: live `wireapp/dev` is `d2124109267b1c9bf483866d96fca193fe27b7d7`, 17 commits beyond recorded upstream `6f9b6a99`. Drift includes locale/configuration, managed-device detection, log retention, CI and translations. No upstream synchronization was mixed into this scoped cutover.

September 14 qualification now has a usable **isolated Linux native keyring**. Ubuntu distro GNOME Keyring/libsecret binaries were downloaded/extracted under `/tmp/m3-native-keyring`, without package installation or host-keyring changes. A private `dbus-run-session`, dedicated mode-0700 XDG directories and a random stdin-only keyring password give Electron `gnome_libsecret`, encryption available and a successful synthetic round trip. Plaintext storage remains disabled. `python3 /tmp/m3-native-keyring/run.py corepack yarn test:e2e --project=macOS specs/criticalFlow/login.spec.ts` passes (17s). This is Linux evidence despite the project name. The same wrapper running critical multi-account/logout plus regression multi-account/calling gives **9 passing / 1 failing in 8.1 minutes**: active-removal's initial login times out before removal, despite successful backend login/client creation. Its isolated unchanged rerun passes in 41.7 seconds; no full-pass claim for that batch. Logs: `/tmp/m3-linux-auth-{login,parity,removal-retry}.log`. Real host D-Bus remains absent, but it no longer blocks this isolated qualification path.

Final-head gates at `1bd28aaf`: build/coverage, lint, analysis and macOS/Linux packages passed in [package run 34818532398](https://github.com/adamlow-wire/wire-desktop/actions/runs/34818532398). Windows failed its controller before/after hooks at the existing two-second deadline before the test body. The attempted single-job rerun was rejected because macOS packaging was still running; no check was bypassed and no test deadline changed. The existing CAP-002 native navigation/SSO fixture repair from `44f8a9ed` is now reconciled as a cutover harness prerequisite; it passes locally in 2.5 seconds with all navigation/SSRF/PiP/deep-link/SSO assertions retained. No other candidate code or overlapping docs were copied. This next head requires new CI; standalone Playwright types still have the same nine pre-existing errors, none in the repaired fixture.

The explicit platform account gate now also includes `electron/src/security/AccountPermission*.test.main.ts`, so actual native dialog cancellation and permission-session integration run on Windows/macOS as well as Linux. The exact expanded command passes locally; hosted results remain required.

Fresh dependency [PR #48](https://github.com/adamlow-wire/wire-desktop/pull/48) targets CAP-001 PR #47. At `3d73fa77`, all required workflow jobs started, including authenticated Windows/macOS E2E and three-platform packages. Fresh local media (4), renderer (4) and combined product fixtures (7, 18.8s) pass, alongside the native/React/types audit above. A subsequent distinct security review reproduced unconsented desktop-thumbnail enumeration: the inert native enumerator was called once and the request succeeded (`/tmp/m3-source-enumeration-before.log`). Production native accounts now omit this capability; the new product assertion requires rejection and zero enumeration before/after camera/microphone consent. TypeScript then production bundle and changed-source ESLint pass; the rebuilt seven-product-fixture suite passes in 17.3 seconds (`/tmp/m3-source-enumeration-restored.log`). New-head CI is required; previous-head green checks cannot qualify the fix. Display-source selection remains open.

The local application enables account-scoped notification/microphone/camera consent. Grants require native cancel-default consent and the exact authorized view/session/origin/document. Unknown permissions, missing identity and subframes remain denied. Pending consent is canceled on switch/hide; document navigation revokes grants. Existing approved background grants are retained. Notification readiness/selection gating and native retry use the existing isolated preload event bridge. New labels use English fallback where untranslated.

The general E2E launcher identifies the real shell and main-selected account, subscribes to native account snapshots, and installs a **test-only** dialog adapter before readiness using separate `-r` arguments. It always uses synthetic devices, never fake permission UI. `mediaConsent: 'allow' | 'deny'` replaces the old bypass option; negative calling no longer overrides session permission handlers. On Linux the bootstrap removes Playwright's forced basic password-store switch; it never enables plaintext encryption.

| Evidence scope | Result | Recorded evidence |
| --- | --- | --- |
| Full native/React/media/renderer checkpoint at `dc511b7d` | 785 native; 112 React/27 suites; 4 media; 4 renderer pass | `/tmp/sec009-final-{main-coverage,react-coverage,media,renderer-coverage}.log` |
| Same checkpoint, correct-base diff coverage | 915/1095 statements (83.56%); 107/108 security branches (99.07%) | `/tmp/sec009-final-diff-coverage.log`, base `d94253c9` |
| Permission/lifecycle/metadata product checkpoint | 3/3 pass on Linux | `/tmp/sec009-final-product.log` |
| Foreground prerequisite repair plus earlier launcher cases | 5/5 pass | `/tmp/sec009-product-foreground-final.log` |
| Latest general launcher, consent and native-storage selection | 3/3 pass, 13.4 seconds | `/tmp/sec009-native-storage-launcher-final.log` |
| Native sidebar plus general launcher/consent, after restoring sensitivity mutation | 4/4 pass, 16.7 seconds on Linux | `/tmp/cap001-sidebar-launcher-final.log` |
| Restored storage-selection sensitivity target | 1/1 pass, 2.6 seconds | `/tmp/sec009-native-storage-restored.log` |
| Authenticated staging login | **Failed**: encryption unavailable, then authenticated-page timeout | `/tmp/sec009-staging-login.log` |
| Changed-source ESLint/format | Pass at recorded checkpoints | Commits `db99cb87`, `de6fd17f` |
| Standalone Playwright types | **Nine existing errors**, not green: two window.wire declarations, seven generated API bodies | `/tmp/sec009-consent-harness-types.log` |

The full coverage checkpoint predates the later test-harness commits; it is not final-head hosted qualification. Application and Mocha type commands are separate (`test:types`, `build:ts:tests`).

Sensitivity retained: wrong account selection/watcher routing fails; approving a deny response returns synthetic tracks and fails; hiding the owner before media fails without a media dialog; forcing the basic store fails its exact flag assertion. Logs include `/tmp/sec009-{account-watcher-sensitivity,consent-deny-sensitivity,permission-focus-sensitivity,basic-store-sensitivity}.log`. All mutations and temporary diagnostics were restored.

Native-sidebar regression: `env -u ELECTRON_RUN_AS_NODE corepack yarn test:e2e --project=macOS specs/regression/accountSidebar.spec.ts specs/regression/launcherPermissions.spec.ts`. The unchanged helper first selected account 1 when account 2 was requested (`/tmp/cap001-sidebar-before.log`); after identity repair, removal timed out on its obsolete DOM-menu locator (`/tmp/cap001-sidebar-native-menu-before.log`). Main-selected page lookup and real native-menu observation now cover switch/add/background/active/last-account removal, including an unrelated window, plus exact logout/remove labels and actual logout event delivery. Suppressing the native logout click fails the expected event assertion (`/tmp/cap001-sidebar-menu-sensitivity.log`); restored combined run passes. Changed-source ESLint and exact-file formatting pass. Playwright types retain only the nine existing errors (`/tmp/cap001-sidebar-types-final.log`), not a green type gate. Authenticated logout keeps its confirmation/cancellation assertions but has not been rerun because secure storage remains unavailable. No production files changed in this repair. The remaining `e2e-tests/utils/createApp.ts` positional launcher has no imports found in the E2E source scan; it was not silently substituted for the active action launcher.

### Known failures, not hidden passes

- **Secure storage:** after removing the forced basic switch, a fresh read-only probe still reports `basic_text` and `isEncryptionAvailable() === false`. D-Bus reports no owner for `org.freedesktop.secrets`. No keyring was installed/unlocked and no credentials were displayed. This is not evidence of wrong staging credentials.
- **Foreground focus:** a combined permission run recorded an unfocused owner and no camera consent request. The test now establishes actual focus before each media flow. An earlier three-launcher run failed the deny case's focus prerequisite; unchanged isolated and later combined runs pass. No claim that compositor behavior is fixed.
- **Shutdown:** one restored-account reopen timed out closing, followed by worker teardown timeout. A read-only lifecycle diagnostic and subsequent uninstrumented runs pass. Retain `/tmp/sec009-launcher-final.log`; no deadline/retry/production-shutdown change was made.
- **Display capture:** pinned Electron reports empty media types for legacy and modern capture. Removing that guard permits owned-window legacy capture and fails the regression; modern callbacks also depend on it. Keep denial; no global empty-types grant, page override or runtime upgrade. DEC-009/RSK-014 remain open. A mixed-media diagnostic's renderer termination is not capture-denial proof.

## Other evidence and remaining M3 gates

CAP-001 implements main-owned account state/views, retained default/persistent sessions, exact-target cleanup, failed-removal retry, metadata identity, native routing and approved environment changes. Browser-visible storage deletion across restart is proven locally; residual-directory/forensic erasure is not. Do not delete live partitions or the default user-data root.

SEC-007 source audit at `ebed07a9`: searching production `electron/src` and `electron/renderer/src` TypeScript/JavaScript/HTML finds no `<webview>` element, `allowpopups`, enabled `webviewTag`, or `createElement('webview')`. Explicit `webviewTag` settings are false. The still-named `Webview` React component renders loading/error/removal UI and requests native layout; its name does not mean DOM account rendering remains. This satisfies only the inspected source-removal condition, not resize/focus/crash/session/platform acceptance. Existing local native fixtures supply separate runtime evidence.

[Draft PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47) last verified remote head is `23fb964b`, not local `a4ce662c`. Its [build/test](https://github.com/adamlow-wire/wire-desktop/actions/runs/34372128997) and [Windows/macOS/Linux package/account gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34372128865) pass; authenticated E2E/report were draft-skipped, **not waived**. Later local commits have no verified hosted gates.

CAP-002's native navigation/SSO and E2EI transport fixtures pass 2/2 locally; disabling native SSO creation fails. E2EI's interactive OIDC redirect differs from SSO popup routing. The fixture proves unregistered-provider denial and same-origin `/oidc` return/session-storage retention—not tokens, ACME issuance, verified-device state, renewal or real-provider compatibility. Webapp reference commit: `a0fae7037367641bc48e97a19fa0312e7cbaff41`. Do not reuse the sibling shared SCIM/SSO user.

M3 still requires production account cutover; custom-backend/managed destination policy; SEC-009 allow/deny user-flow/platform acceptance; SEC-010 local protocol; certificate exception behavior; deep-link/single-instance parity; separate live SSO and E2EI enrolment/renewal evidence; and final cross-platform package/authenticated E2E/review audit. Signed installer/update and external release review stay under their M4/M5 owners.

## SEC-010 bounded source review (2026-09-10)

Reviewed candidate `2ce86631` against its CAP-001 base `a4ce662c`: the seven-entry resource map, response/registration modules, normal/proof startup composition, shell/About/proxy identity and navigation bindings, new protocol/CSP/product tests, and CI registration. No blocking defect identified in this reviewed protocol boundary; this is a source review, not final-head PR approval or independent security review.

- Renderer paths never become filesystem paths: only role-matched fixed assets are joined to the trusted application directory. Unknown/write requests fail closed; read errors produce generic 500 responses; HEAD has no body.
- CSP, MIME/nosniff, no-store and pre-ready minimal scheme privileges are explicit. The CSP test loads an ordinary script, not a debugger-only eval probe. Its extra resource is test-only.
- Session-specific handlers preserve narrower auxiliary roles. Exact registered document URL, native sender/frame and session checks remain essential: a shared custom scheme or JavaScript URL `origin` alone is not local-document authorization.
- The migration reader remains script-disabled and conditional on a missing versioned profile. Normal application windows use the new scheme; proof startup has a separate mutually exclusive protocol path.
- Packaging filters do not intentionally exclude the seven assets, but source inspection is not packaged execution. Existing retained logs show Linux product 2/2 and correct-base diff coverage 80.99% statements / 100% security branches; these were not rerun during this read-only review.
- ADR 0003 remains proposed. Hosted/platform qualification, reconciliation with the permission candidate and final-head review are still required; do not repeatedly count this same source review as new progress.

## Maintainer decisions / external prerequisites

- Secure storage: enable an unlocked Linux keyring, provide a Mac test environment, or use hosted runners once available. This is **not code signing**.
- E2EI Q-011: dedicated staging E2EI team/OIDC/ACME configuration versus newly provisioned isolated test team. Await response; no new team created.
- Q-005: retain an exact-certificate/hostname/account-session restart-cleared override, or remove manual overrides. Chromium errors remain denied either way.
- Display phase boundary: CAP-003 assigns sharing migration to M4, while later SEC-009 notes treated its chooser as an M3 blocker. Maintainer clarification remains pending; no silent scope reduction.
- GitHub: **resolved for restart on September 14**. Authenticated API reads of PR #47, integration, open PRs and check runs succeeded. No publication/merge was performed. The installed CLI lacks `gh pr view --json headRefOid`; read `.head.sha` through `gh api` instead.

Historical September 10 diagnostics: both authenticated API and unauthenticated curl failed TLS negotiation; D-Bus then reported no secret-service owner. September 14 supersedes those connectivity observations as described above. No application tests were run in this handoff session; the retained evidence must not be presented as fresh validation.

## Durable history and operating rules

Merged evidence remains in [the plan](./plan.md): [PR #45](https://github.com/adamlow-wire/wire-desktop/pull/45) download containment at `d94253c9`; [PR #44](https://github.com/adamlow-wire/wire-desktop/pull/44) SEC-012 at `62435cc6`; [PR #46](https://github.com/adamlow-wire/wire-desktop/pull/46) fixture teardown at `6f256d59`; [PR #42](https://github.com/adamlow-wire/wire-desktop/pull/42) CSP at `9c188bf1`; [PR #43](https://github.com/adamlow-wire/wire-desktop/pull/43) SSO callbacks at `ef050e42`.

Detailed checkpoint chronology is retained in Git, not as competing next-step instructions: `git show de6fd17f:docs/electron-modernization/status.md`; E2EI history at `44f8a9ed`; each candidate's status at its tabled head. Temporary log paths may disappear and do not replace durable final-head PR/CI evidence.

- One primary work item per PR; integration remains PR-only. Self-merge only after applicable final-head gates and substantive review pass.
- Run native GUI suites serially. Build TypeScript **then bundle** before product tests; never rebuild during a live native run. Keep sandboxing enabled and unset `ELECTRON_RUN_AS_NODE`.
- Use explicit integration SHA for coverage base after verifying refs. Coverage examines committed HEAD; regenerate clean reports for the active candidate.
- Preserve `wrap/worktrees/wpb-5221-deployment-audit` and MSI artifacts. Never run `clear:wrap`, broad cleanup or local `build:prepare`. Format exact files.
- Never capture real devices/screens, display notifications, modify trust stores, expose credentials, or weaken an invariant to get a pass.
- The old thread goal remains blocked historically; the fresh session must assess execution from the September 14 facts, not inherit that verdict. No acceptance gate has been waived.
