# Baseline-first testing strategy

## Purpose

The modernization changes code that few people understand and that integrates with operating systems, identity providers, remote web content, installers, and update systems. Tests are therefore the primary control for preserving required behavior while replacing unsafe implementation mechanisms.

This is characterization-driven development followed by test-driven implementation:

1. Establish what the current application does and which behavior is required.
2. Add a test that passes against the current implementation.
3. Prove the test would fail if the protected behavior were broken.
4. Change the implementation while keeping the contract test unchanged.
5. Add security tests for behavior that the legacy implementation does not satisfy.

Existing behavior is not automatically correct. Security invariants describe the required target even when the corresponding target test initially fails.

## Native-account E2E harness checkpoint (2026-09-10)

`accountSidebar.spec.ts` is a CAP-001 regression for DCP-002/DCP-004. It uses isolated local profiles and real native views/menus to exercise switching, background/active/last-account removal, addition, and logout event delivery with an unrelated window present. It reproduced incorrect positional page selection and the obsolete DOM-menu timeout. The helper now resolves the main-selected account and invokes the actual enabled native menu item; no production IPC or permission bypass is added. The authenticated logout spec retains its menu labels/enabled-state and confirmation/cancellation assertions using that adapter. Local fixtures do not prove staging login, actual data-clearing confirmation, live SSO/E2EI, or macOS/Windows operation.

## Test classifications

Every added modernization test MUST be classified in its name, enclosing suite, or PR evidence as one of:

- `characterization`: Captures required existing product behavior and initially passes.
- `security-target`: Expresses a required invariant and MAY initially fail on the legacy shell.
- `regression`: Prevents recurrence of a confirmed defect.
- `compatibility`: Protects an Electron, operating-system, packaging, or dependency transition.
- `migration`: Protects user data or installation state across versions.

## Characterization workflow

For each behavior:

1. Link the behavior to a capability ID in `capabilities.md` and a plan work item.
2. State the contract in observable terms, including supported platforms and important exclusions.
3. Choose the lowest test layer that proves the contract without coupling to private implementation.
4. Run the new test against the unchanged implementation and record the passing command/result.
5. Prove sensitivity using a temporary perturbation, such as replacing the expected action with a no-op or changing a decision outcome.
6. Run the test and observe the expected failure for the intended reason.
7. Revert the perturbation and confirm the test passes again.
8. Commit the test without the perturbation, preferably before the implementation commit.

The sensitivity check is evidence, not committed sabotage. Record a concise description and command in the PR; do not commit temporary mutation code or bulky test output.

## Security-target workflow

Security-target tests describe desired behavior and can expose a known legacy failure:

1. Link the test to one or more security invariant IDs.
2. Demonstrate the legacy result and label it explicitly as expected legacy failure.
3. Keep legacy-failing tests out of mandatory CI only through a narrow, named quarantine with an owner and removal work item.
4. Make the test mandatory in the same PR that implements the invariant.
5. Include positive authorization and negative/hostile cases.

Do not encode insecure legacy behavior as a characterization contract.

## Required layers

| Layer | Best suited to | Required qualities |
| --- | --- | --- |
| Pure unit | Parsing, schemas, origin and permission decisions | Fast, deterministic, table-driven deny cases |
| Electron integration | Effective preferences, IPC identity, sessions, windows/views | Uses real Electron behavior where mocks could hide privilege |
| Hostile renderer | Boundary enforcement | Attempts raw IPC, navigation, popup, Node access, and cross-account access |
| Development E2E | Product flows | Fresh user data, deterministic accounts, retained traces on failure |
| Packaged smoke | Fuses, signing, protocols, tray, permission behavior | Runs the artifact that would be distributed |
| Installer/update | Install and migration state | Fresh install, upgrade, repair where applicable, uninstall, rollback |
| Manual/platform | Native UI that cannot be trusted to mocks alone | Scripted checklist with artifact/version evidence |

## Quality rules

- Tests MUST assert an observable outcome, not merely that a mock was called, when the outcome is practical to observe.
- Mocks MAY isolate operating-system effects, but at least one higher-level test MUST cover each critical integration.
- Time, network, identity-provider, and platform dependencies MUST be controlled or explicitly declared.
- Tests MUST use fresh per-test account/session data unless persistence is the contract under test.
- Deny-path tests MUST verify no privileged side effect occurred.
- Flaky tests MUST NOT be hidden with unbounded retries. Quarantine requires an owner, reason, issue, and expiry.
- Updating a characterization assertion during migration requires an explicit capability-contract or scope change.
- Coverage percentages are supporting signals. Capability and invariant coverage are release gates.

## Initial priority

The first baseline additions should be:

1. SSO protocol validation, ephemeral session lifecycle, cookie transfer, and cleanup.
2. View/session identity and cross-account isolation.
3. Privileged IPC inventory with authorized, unauthorized, and invalid-payload cases.
4. Navigation, popup, external-link, and deep-link policy.
5. Certificate verification and exception behavior.
6. Permission decisions for camera, microphone, display capture, and notifications.
7. Tray/menu/badge platform branches.
8. Updater/installer selection and migration behavior.

## Evidence required in a modernization PR

```yaml
test_evidence:
  work_items: [TST-NNN, CAP-NNN]
  capabilities: [DCP-NNN]
  invariants: [INV-NNN]
  baseline_command: <command or not-applicable>
  baseline_result: <pass/fail and durable CI link when available>
  sensitivity_check: <temporary perturbation and expected failure>
  target_command: <command>
  target_result: <pass/fail and durable CI link when available>
  platforms: [windows, macos, linux]
  gaps: []
```

Only list platforms actually exercised. Unrun platforms are gaps, not implicit passes.

## Validation cadence during M3

Authenticated Linux E2E needs an available native secure-storage backend. Playwright's Electron loader forces `--password-store=basic`; the general test bootstrap removes this override before readiness so Electron can discover the host keyring. This does not supply or unlock a keyring. If `safeStorage.isEncryptionAvailable()` remains false, record the host prerequisite and use an appropriately provisioned Linux/macOS/Windows runner; never enable plaintext encryption to qualify authentication. Pure local boundary fixtures do not prove credential-storage availability.

The general E2E launcher uses `e2e-tests/utils/nativeConsent.cjs` as a **test-only main-process require hook**, installed before app readiness. It controls responses to the account-consent dialog, not session permission decisions. `mediaConsent` selects allow/deny; notifications remain separately scoped. Always supply synthetic devices and never `--use-fake-ui-for-media-stream` for this Electron launcher. Tests verify effective flags, pre-ready installation, actual audio/video allow/deny and selected-account restart. The negative calling test must not replace the production session permission handler. These fixtures do not establish real user/OS consent, authenticated calling or platform qualification.

Native media permission tests run in a separate process with `env -u ELECTRON_RUN_AS_NODE corepack yarn test:media` (use `xvfb-run` on headless Linux). This command supplies fake media devices but deliberately does not bypass permission UI. The suite asserts these launch conditions before accessing media and stops synthetic tracks immediately. Its `.test.media.ts` suffix prevents accidental capture in ordinary main-process runs; `yarn test` and the cross-platform baseline workflow explicitly include it. Synthetic-device results do not establish real OS permission prompts or packaged calling parity.

The isolated product fixture `accountPermissions.spec.ts` exercises activated main/preload consent. It controls native dialog responses through the test runner only, requires real foreground eligibility and fake devices without fake permission UI, and stops tracks immediately. The page reports readiness only after test setup. Its approval and reload-denial checks do not waive authenticated calling, real user approval or OS permission qualification. Never add a production flag that automatically approves permission requests to make these tests pass.

Every PR must pass its focused characterization/security tests and the protected branch's required build, lint, and analysis checks. Authenticated cross-platform E2E is required when a PR changes observable product behavior, activates a new production boundary, or closes an M3 execution checkpoint. A schema-only migration inside an already characterized boundary may defer authenticated E2E to the next checkpoint when the PR records that gap; this reduces duplicated staging runs without weakening the M3 exit gate.

### CAP-005 native Windows machine destination

The existing backend candidate adds `WindowsMachineDestination.test.main.ts`. On native Windows, run `yarn electron-mocha --require .babel-register.js electron/src/settings/WindowsMachineDestination.test.main.ts --no-sandbox`. It requires rights to create its unique `HKLM\SOFTWARE\Wire\M3-destination-test-<uuid>` leaf, removes only that leaf in `finally`, and never changes an installed product value. It uses the real pinned registry dependency and production policy functions; no actual server connection or certificate trust change occurs. The platform workflow must first prove the test detects a temporary removal of `assertManagedAccountDestination(candidate, managed)`, verify the specific foreign-destination assertion fails, restore the source, then run the passing target. Hosted Windows evidence remains required; Linux does not register this Windows-only case.

## CAP-005 packaged configuration fixture (September 14)

`bin/test-tools/packaged-account-smoke.cjs` is a compatibility/security-target fixture for DCP-013 and page Node denial. CI passes the actual packaged executable with unchanged fuses. It uses normal account navigation to an isolated nonce-bearing loopback page; no debugging port, inspector, injected preload or production test mode is involved. It asserts an account ID, the compatibility bridge, immutable exact App-lock configuration, absent page Node globals and top-level account context. A second fresh launch reads a real test-owned OS policy value, proving the configuration changes on restart. Windows/macOS launches are restricted to disposable GitHub Actions runners; Linux profile/XDG state is isolated. Existing machine policy is not overwritten; workflow traps/finally remove only the created value. This is backend compatibility, not MDM enrollment/deployment. The managed launch also exercises an authenticated HTTP proxy as described below. Cleanup terminates only the fixture's child tree and does not claim graceful shutdown.

Local fixture qualification (development binary, **not packaged or macOS/Windows evidence**):

```sh
yarn build:ts && yarn bundle
env -u ELECTRON_RUN_AS_NODE node bin/test-tools/packaged-account-smoke.cjs /home/sysop/wire/wire-desktop/node_modules/electron/dist/electron .
node --check bin/test-tools/packaged-account-smoke.cjs
node_modules/.bin/eslint --no-ignore bin/test-tools/packaged-account-smoke.cjs
```

The unchanged production bridge passes. Temporarily renaming the real `desktopAppConfig` exposure, rebuilding and rerunning fails immutable/configuration/version assertions. Restore the preload, rebuild and the same fixture passes. Separately, `M3_EXPECT_APPLOCK_OVERRIDE=true` on the local unmanaged fixture fails the exact override assertion without modifying host policy. Logs: `/tmp/m3-packaged-driver-{local,sensitivity,restored,value-sensitivity,lint}.log`. Native Windows/macOS/Linux package runs remain required before merge. No temporary production mutation is committed.

The second packaged launch sets `M3_AUTHENTICATED_PROXY=true`. The external driver serves its fixed fixture through a local HTTP proxy responder, requires an actual 407 challenge and authenticated request, and gives only the child process synthetic environment credentials. The app uses its normal system-proxy credential handler. There is no external forwarding, trust-store change, debugging hook or production flag. Both the real native prompt/session regression and this packaged environment-credential path are required; neither stands in for the other. Local qualification uses the development executable above with that environment flag. Canceling the actual native authentication callback prevents account startup and fails the 45-second fixture deadline; restore/rebuild and it passes. Logs: `/tmp/m3-packaged-proxy-{local,sensitivity,restored}.log`. Hosted package results remain pending; this does not claim every enterprise proxy variant.

The macOS functional package is built by `bin/test-tools/build-macos-smoke.ts` on disposable native CI only. The existing MAS build requires signing/provisioning unavailable in this M3 gate and did not initialize the functional fixture. The test builder reuses the current packaging/fuse functions with a standard Darwin target matching the runner architecture (arm64 or x64), verifies the actual Mach-O architecture, checks the configured fuse bytes, applies and verifies an ad-hoc development seal, and verifies the entire fuse wire is unchanged. It requests no signing identity and changes no trust store. The normal MAS release builder is unchanged. This qualifies application/backend behavior in a development package; signed MAS, installer and release certification remain M4/M5. [Electron MAS requirements](https://github.com/electron/electron/blob/main/docs/tutorial/mac-app-store-submission-guide.md).

CAP-005 qualification repair: `ProxyLogin` owns the native event-to-prompt binding so coverage exercises host/port credential selection and the actual prompt coordinator, session application and cancellation reload. Separate sandboxed product fixtures retain the real HTTP challenge and unrelated-session assertions. `AccountViews` pending-consent tests create native views in a ten-second setup hook, keeping the original two-second request/abort/denial body. Removing actual hide cancellation or native-close reload fails the respective assertion; restore product sources before qualification. Native failure traces are uploaded by the platform workflow. Metadata normal quit is dispatched without waiting for an inspector reply that may be lost during process exit; zero native exit remains mandatory, and a quit veto still fails the ten-second expectation.

The native `AccountViews` integration suite has a finite ten-second per-test/hook budget for real renderer startup, cookie/storage operations and teardown, matching existing native setup budgets. This is not a performance benchmark. The previously explicit crash-recovery limit remains fifteen seconds; pending-consent bodies remain explicitly two seconds with separate ten-second setup. The final-head Windows run at `2fd2f5d1` exposed five different default-two-second timeouts in otherwise unchanged lifecycle/storage tests (168 passed); increasing only one setup had shifted the next failure. No assertion, fixture action, skip, retry count, permission handler or production timeout changes.

Native normal-quit investigation: metadata fixtures retain up to64KiB of native output and lifecycle phase logs, plus a bounded macOS process sample on failure. A failing zero-exit assertion remains a failure; only its owned child may then be terminated for cleanup. A deliberate quit veto must still fail and retain diagnostics without leaving a worker teardown timeout. The native workflow manual `product_repeats` choice is bounded to1 or5 and defaults to1 for ordinary PR checks; repetitions are investigative evidence, not a substitute for final-head gates.

The metadata/native-quit fixture explicitly uses zero retries on every platform. Failure cleanup must not convert an underlying shutdown or persistence defect into a passing flaky result.

Packaged startup diagnostics retain elapsed time, child exit/signal state and fixture proxy counts on failure. On macOS, a bounded sample of only the owned child is written beneath `test-results/packaged-smoke-*` before cleanup, so the existing failure-artifact upload retains it. The 45-second report deadline, exact managed policy/bridge/Node assertions and real authentication requirements are unchanged. Native architecture qualification avoids introducing x64 translation into an arm64 functional gate; cross-architecture and signed release qualification stay with the release milestones.

Certificate callback preflight explicitly includes both synthetic decision/dialog and native loopback TLS groups on Windows/macOS/Linux. Real TLS uses only a public test key/certificate and exact-origin fixture traffic; no CA is installed and macOS trust UI is stubbed in adapter tests. This establishes native fail-closed completion, not Q-005 exception policy. Draft preflight uses the exact existing CAP-005 base; after the dependency merges, require strict current-integration-base and every final-head gate including authenticated E2E/report.

CAP-005 proxy prompt ordering baselinea5bcb6a5 fails before implementation for pending and rejected session setup. State publication now follows successful setup; restoring the old order fails both assertions, and restored20 direct action/coordinator/login plus3 real proxy product cases pass. Existing retry and exact challenged-session behavior remain intact. `/tmp/m3-proxy-prompt-state-{before,sensitivity,restored,product,types,lint}.log`; hosted final-head qualification remains required.

### SEC-010 protocol registration

`test:main` and `test:main:coverage` register the local scheme through `electron/test/register-local-scheme.cjs` before readiness, matching production minimal privileges. This helper installs no resource handler or CSP bypass. Direct electron-mocha tests of protocol documents require `--require-main electron/test/register-local-scheme.cjs`; the direct secure-shell group also passes without it. The platform baseline includes `test:main --grep "local content"`. Existing prior results remain historical; require new current-composition and final-head hosted gates.

Existing candidate preflight uses a linear draft PR stack: SEC-010 targets the CAP-005 candidate; CAP-006 targets SEC-010. The four focused workflow branch filters include those two exact bases. These drafts run build/lint/analysis and native/package qualification without authenticated E2E. Integration enforces strict current-base checks: after the dependency merges, retarget the next PR, merge the actual integration head, and require every final-head gate including authenticated E2E/report before merge. Preflight skips are never completion evidence.

The production account-controller integration suite has a finite ten-second aggregate test budget, matching its existing native setup/teardown limits. Its shell-control and storage-failure/retry cases perform several renderer/session transitions and exceeded Mocha's implicit two-second body default in PR #51 macOS preflight. This changes no action, assertion, internal wait, product timeout or retry. Direct authorization/policy suites retain their own budgets. Reversing real state removal or skipping actual filesystem cleanup must still fail the affected assertions; restore mutations before qualification.

September14 lifecycle preflight repair: split secure-shell popup, notification and two navigation denials into independent cases after the original combined body exceeds two seconds on macOS in [34851141471](https://github.com/adamlow-wire/wire-desktop/actions/runs/34851141471). Each body still has two seconds; assertions, settling waits and production policy are unchanged. Completed build/types/lint and11 native cases pass; temporary account-popup allowance fails the split target, and restored source passes. Logs `/tmp/m3-native-denial-split-{build,types,lint,sensitivity,final}.log`. This is preflight evidence, not final integration acceptance.

Protocol integration adopts the previously sensitive native fixture repairs from lifecycle preflight: account-controller aggregate body budget10 seconds, and independently named popup/notification/direct-navigation/redirect denials each retaining two seconds. Production policy and assertions are unchanged. PR #49 merged4f04a8a0 after all final-head gates passed, including43 initial authenticated passes/platform. PR #50 must independently pass current integration-base gates; prior preflight is insufficient.

Current integration composition passes completed app build/bundle, Mocha types, changed-source lint,81 focused native cases and five actual storage/metadata/proxy product cases (15.0 seconds). Evidence: `/tmp/m3-protocol-integration-{build,types,lint,native,product}.log`. These are local Linux checks; hosted native/package and authenticated final-head gates remain required.

The corrected executable fixture passes completed TypeScript/bundle, changed-source lint and the real Linux two-process/storage/restart case (6.3 seconds). Standalone Playwright types retain the same nine prior errors outside this fixture. Original Windows1c919 failure provides the baseline; actual Windows qualification is required for the repair. Logs `/tmp/m3-second-instance-executable-{build,lint,types,product}.log`.

### Native cleanup aggregate budget and current preflight gaps

Lifecycle97223344 [34859128832](https://github.com/adamlow-wire/wire-desktop/actions/runs/34859128832) passes Linux native/package qualification. macOS job104026394143 passes172 cases but the exact-target localStorage/IndexedDB/CacheStorage case exceeds its implicit two-second body limit. That case opens four actual documents, seeds/clears/reads storage and verifies the unrelated session survives; it now has a finite ten-second aggregate body budget. Omitting target.clearData still fails the exact storage readback assertion; restored source passes all six cleanup cases (811ms), Mocha types and lint. No action, assertion, production timeout or policy changes. Logs `/tmp/m3-cleanup-budget-{sensitivity,restored,types,lint}.log`.

Windows job104026393883 passes430 boundary cases but a popup-fixture beforeEach fails with ERR_NO_BUFFER_SPACE loading its loopback page. It never reaches the corrected second-process fixture, so Windows actual-Electron delivery remains unqualified. Preserve `/tmp/m3-972-windows-native.log` and `/tmp/m3-972-macos-native.log`; do not infer another dispatch defect. Next: integrate protocol #50 once authenticated E2E/report passes, merge its actual integration head into this existing branch, and require every final-head check including native Windows delivery and full authenticated E2E/report.

Current lifecycle preflight [34861051677](https://github.com/adamlow-wire/wire-desktop/actions/runs/34861051677) at7d15a032 passes all three native/package platforms, including Windows job104033043104. Its diagnostic records the actual Electron executable delivering the exact synthetic deep-link argv to the primary, exit0/no signal, and all five product cases pass initially (35.2 seconds). This proves the fixture launcher correction; no production dispatch change was required. `/tmp/m3-7d15-windows-native.log` retains the evidence. The actual integration mergea4fceebe includes18235a5a with no runtime diff from7d15; a completed TypeScript/bundle rebuild passes (`/tmp/m3-lifecycle-integration-build.log`). Final integration-head hosted gates remain required.

### Combined CAP-005 lifecycle/protocol qualification

Existing CAP-005 candidate now includes lifecycle final head1eaf7fba (on merged protocol18235a5a); production callback/proxy fixes merge unchanged. Completed TypeScript/bundle, Mocha/build-tool types, changed-source lint,57 native certificate/proxy cases and five actual account storage/metadata/proxy product cases (15.7 seconds) pass. Evidence `/tmp/m3-certificate-final-stack-{build,types,product}.log` and `/tmp/m3-certificate-preconnect-{types,lint,restored}.log`.

The initial combined native run was56 passes/one failure: the correct loopback -2 decision was followed by a legitimate net::OK background redirector.gvt1.com verification despite HTTP-origin filtering. TLS verification can precede that filter. The fixture now denies foreign hosts directly before its production-verifier wrapper, retaining exact [-2], authority-invalid details, one dialog and zero HTTP assertions for its own loopback request. Deliberately returning -3 instead fails both exact native assertions; production source is restored and all57 targets pass. `/tmp/m3-certificate-final-stack-native.log` retains the initial finding; `/tmp/m3-certificate-preconnect-sensitivity.log` proves assertion sensitivity. No production certificate policy, callback contract, trust store or required assertion is relaxed.

Draft #52 targets the existing lifecycle branch for a scoped preflight, with that exact branch added to the four focused workflow filters. After #51 merges, retarget to actual protected integration, merge its head and require every final-head gate including authenticated E2E/report. Q-005 remains pending; current manual pinning bypass is not accepted as a completed target policy.

CAP-005 combined-head current-base check: `env -u ELECTRON_RUN_AS_NODE DIFF_COVERAGE_BASE=1eaf7fbadcd22a9a4f9c6f286ad8dd7817c6519f node .yarn/releases/yarn-3.3.1.cjs coverage` passes112 Jest,896 main and four renderer cases,26/27 changed statements (96.30%, required80%). The hosted [34863181993](https://github.com/adamlow-wire/wire-desktop/actions/runs/34863181993) failure is retained: all tests passed, but a concurrent retarget left the event using absent former base66f9d9db with a shallow synthetic merge onto1eaf7fba. Renew hosted qualification through a fresh current-base synchronize event; do not treat that failed comparison or local evidence as a final hosted pass. [Native34863181810](https://github.com/adamlow-wire/wire-desktop/actions/runs/34863181810) passes all platforms after one unchanged Windows retry for an existing ten-second teardown timeout; no timeout or assertion changes. Local logs `/tmp/m3-certificate-current-base-coverage.log`, `/tmp/m3-1f77-build.log`, `/tmp/m3-1f77-windows-native{,-retry}.log`.

Certificate final integration reconciliation67b5e023 merges reviewed lifecyclec74d116e. `node .yarn/releases/yarn-3.3.1.cjs prestart` completes TypeScript then bundling (`/tmp/m3-certificate-integration-build.log`). Production, test and workflow trees equal qualified64ec35ab; its fresh112 Jest/896 main/four renderer coverage result remains valid locally, while all hosted gates must run anew against actual integration. CAP-006/SEC-013 final acceptance comes from reviewed #51 and its exact-head build/native/package/authenticated E2E/report evidence; no duplicate lifecycle implementation is added.

CAP-002 reconciled97f6f1ac with actual reviewed integration784ffabe: completed `node .yarn/releases/yarn-3.3.1.cjs prestart`, then isolated-keyring `test:e2e --project=macOS e2e-tests/specs/regression/accountNavigation.spec.ts e2e-tests/specs/regression/e2eiNavigation.spec.ts --reporter=line` gives2/2 passes in8.2 seconds on Linux. The 80-line candidate is unchanged; logs `/tmp/m3-e2ei-final-integration-{build,product,lint}.log`. The macOS project name does not establish native macOS execution. These are inert transport assertions, not live OIDC/ACME, enrolment, verified-device, restart or renewal acceptance. Dedicated Q-011 provider inputs remain required; Q-005 policy is also pending after fully qualified certificate safety PR #52 merged.

September 14 scope revision approved by maintainer: build sensitive automated tests for desktop-owned SSO/E2EI boundaries without provisioning a real provider environment. Map tests to those boundaries, run supported-platform final-head gates, and hand live Keycloak/OIDC/ACME success, persistence, renewal and failure acceptance to [qa-sso-e2ei.md](qa-sso-e2ei.md). Simulated redirects and backend responses must retain explicit transport/boundary labels. They do not prove cryptographic or live provider success.

## CAP-002 automated closeout coverage

The September 14 scope decision separates desktop automated acceptance from the unrun live QA checklist. The native selection `SingleSignOn|SSO window coordinator|SSO window-control|SSO account-limit` passes64 cases on the integrated runtime. `SingleSignOn.test.main.ts` protects fresh ephemeral sessions, exact callback schemas, one-use/revoked secrets, separate flows, POST denial, cookie-domain/target isolation, cancellation during initialization/transfer, close/focus ownership and cleanup failure handling. `SsoBackendCompletion.test.main.ts` exercises actual loopback backend-style success/error redirects, native isolated windows, exact target cookies and unrelated-account preservation. Coordinator and IPC suites cover reservation/cleanup, wrong-account controls and account-limit authorization. All four groups are selected explicitly in each native platform job.

The product account-navigation fixture protects actual sandboxed navigation/redirect denial and main-owned SSO; E2EI transport cases preserve exact callback query and account session storage for synthetic authorization, access_denied and login_required responses. These values do not authenticate or enrol a device. Removing preventDefault from the actual compiled NavigationGuard makes all three new cases fail; the compiled file is restored byte-for-byte from its saved original before the final product run. Logs `/tmp/m3-cap002-closeout-{build,lint,native,sensitivity,product}.log`. Native product selection now runs both navigation and E2EI transport fixtures on Windows/macOS/Linux alongside storage/metadata/proxy tests. Require final-head hosted checks; local project macOS still runs on Linux. No production runtime changes.
