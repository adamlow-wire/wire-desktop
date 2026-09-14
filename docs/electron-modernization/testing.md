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
