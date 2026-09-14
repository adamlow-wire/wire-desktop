---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-14
milestone: M3
active_work_item: CAP-006
state: qualifying-existing-lifecycle-candidate
integration_branch: integration/electron-modernization
integration_head_commit: 4f04a8a0700d388a9b1199e5905df5f2bc70b72e
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: cap/CAP-006-second-instance-2026-09-10
next_work_item: CAP-005
blockers:
  - live-sso-e2ei-provider-configuration-pending
  - certificate-exception-policy-pending
---

# Current project status

## Current execution

Lifecycle PR #51 is reconciled with protocol candidate4f867021 while its final checks run. Preflightba38c1a7 passes build/lint/analysis and macOS/Linux native/package gates, but Windows consistently fails the actual second-process delivery assertion across all three attempts: the secondary exits0 while the selected account remains on devices instead of account preferences. This is a functional failure, not a timing-budget failure. Preserve exact delivery/exit/account-count assertions and diagnose the actual Windows event/argv before changing behavior. Evidence [34852932003](https://github.com/adamlow-wire/wire-desktop/actions/runs/34852932003), Windows job104005141428, artifact10352651247, `/tmp/m3-ba38-windows-native.log`.

Protected integration is `4f04a8a0700d388a9b1199e5905df5f2bc70b72e`, after reviewed PR #49 passed every final-head gate. The exact head66f9d9db passes build/coverage, lint, analysis, Windows/macOS/Linux native/package qualification and authenticated Windows/macOS E2E/report:43 initial passes per platform, no retries, skips or worker errors. Native macOS arm64 packaging verifies architecture, preserved fuses and ad-hoc seal, then passes ordinary and managed/authenticated-proxy startup. Durable links and the substantive review are in [PR #49](https://github.com/adamlow-wire/wire-desktop/pull/49).

The Windows handoff diagnostic records only the test-owned primary/secondary argv/profile, delivered second-instance events, exit/signal and the last16KiB of child output. Assertions and deadlines remain unchanged. The fixture does not change production dispatch or grant permission. Qualify the diagnostic on actual Windows; do not infer a parser or timing cause from a successful secondary exit alone.

The rebuilt diagnostic composition passes changed-source lint and the actual Linux two-process/storage/restart case (6.8 seconds); the primary receives the exact synthetic deep-link argv, the selected account changes correctly and the secondary exits0. Standalone Playwright types retain only the same nine existing generated/mock declaration errors, none in this fixture. Logs `/tmp/m3-second-instance-diagnostic-{build,lint,types,product}.log`. Windows diagnosis remains required.

### Actual Windows second-process launcher

Diagnostic1c919c2f [34857916192](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857916192), Windows job104022164711, records three identical failures: primary argv names Electron, but secondary spawnargv begins `C:\Windows\system32\cmd.exe`, exits0 and delivers no second-instance event. Playwright's process handle identifies its Windows wrapper. The fixture now asks the running primary for `process.execPath` and launches that exact Electron executable with unchanged argv/profile. No production lifecycle or parser change is justified by this fixture failure. Preserve exact selected-account delivery, zero exit and account count checks. `/tmp/m3-1c91-windows-native.log` retains the diagnosis. Linux native/product tests pass but package download returns HTTP504; macOS native/package passes.

Protocol final head4f867021 passes build/lint/analysis and all three native/package gates. Its first Windows attempt timed out in the fake-media fixture's beforeEach at2000ms before a permission assertion ran; one unchanged-head job rerun104022719435 passes completely. Both attempts remain in [34857405317](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857405317). Authenticated E2E/report34857460712 remains running; do not merge until it completes successfully.

The corrected executable fixture passes completed TypeScript/bundle, changed-source lint and the real Linux two-process/storage/restart case (6.3 seconds). Standalone Playwright types retain the same nine prior errors outside this fixture. Original Windows1c919 failure provides the baseline; actual Windows qualification is required for the repair. Logs `/tmp/m3-second-instance-executable-{build,lint,types,product}.log`.

### Native cleanup aggregate budget and current preflight gaps

Lifecycle97223344 [34859128832](https://github.com/adamlow-wire/wire-desktop/actions/runs/34859128832) passes Linux native/package qualification. macOS job104026394143 passes172 cases but the exact-target localStorage/IndexedDB/CacheStorage case exceeds its implicit two-second body limit. That case opens four actual documents, seeds/clears/reads storage and verifies the unrelated session survives; it now has a finite ten-second aggregate body budget. Omitting target.clearData still fails the exact storage readback assertion; restored source passes all six cleanup cases (811ms), Mocha types and lint. No action, assertion, production timeout or policy changes. Logs `/tmp/m3-cleanup-budget-{sensitivity,restored,types,lint}.log`.

Windows job104026393883 passes430 boundary cases but a popup-fixture beforeEach fails with ERR_NO_BUFFER_SPACE loading its loopback page. It never reaches the corrected second-process fixture, so Windows actual-Electron delivery remains unqualified. Preserve `/tmp/m3-972-windows-native.log` and `/tmp/m3-972-macos-native.log`; do not infer another dispatch defect. Next: integrate protocol #50 once authenticated E2E/report passes, merge its actual integration head into this existing branch, and require every final-head check including native Windows delivery and full authenticated E2E/report.
