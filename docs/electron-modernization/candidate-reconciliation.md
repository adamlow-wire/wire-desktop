# Candidate reconciliation — September 22

This is TST-006 compatibility evidence, not integration acceptance or a Wire handoff. The detached validation checkout contains the candidate source together; the implementation branches and integration remain unchanged. Documentation conflicts were not fully reconciled in that checkout, so its commit must not be merged as the handoff candidate.

## Verified inputs

Read-only GitHub verification at 2026-09-22 18:11 BST confirms integration remains `897e3930392fdc9479f9641c8c03f116947d4e95`. [PR62](https://github.com/adamlow-wire/wire-desktop/pull/62) is the only open fork PR, at `a1cb2b84c2ba90c75a674865371c74334adcc548`, targeting integration. This read does not requalify its previously failing E2E run.

| Scope | Local head used | Relationship / required treatment |
| --- | --- | --- |
| CAP-001 account queue/logging | `a1cb2b84` | Open PR62; runtime fixes already present in packaging/updater stack, but head itself is not an ancestor. Preserve its complete scope and evidence. |
| PKG-003 settings recovery | `7f16dffa` | Ancestor of SEC-003 and CAP-002 candidates. Reconcile after CAP-001. |
| SEC-003 IPC lifetime/picture bounds | `38722dff` | Contains PKG-003; ancestor of CAP-002. Retain a scoped PR after its dependency. |
| CAP-002 SSO diagnostics | `b58de5a1` | Contains PKG-003 and SEC-003. Its six remediation modules remain byte-identical in the validation composition. |
| PKG-001 packaging/failure/confidentiality | `8dc1b19a` | Contains packaging changes through `641af325`, plus handoff documentation. Newer than the packaging base inherited by ELC-003. |
| ELC-003 dependencies | `abae1a66` | Fully contained in PKG-002. Requires packaging's copy-config patch as well as its own dependency overrides. |
| PKG-002 updater routing/policy | `3f2c1bef` | Fully contains ELC-003. Includes unsigned-ASAR gate, startup policy and diagnostic remediations. |

## Validation composition

Detached checkout: `/tmp/wire-tst006-reconcile`. Initial validation commit: `09214ca9`; tree: `3a2ba6f587f06918929477352823fa7598c25c48`.

1. Start from updater `3f2c1bef`.
2. Merge packaging `8dc1b19a` into detached validation commit `14e55cca`. Preserve all ELC-003 resolutions and add the exact copy-config patch resolution. Yarn's lock merge applies cleanly; immutable installation validates it without regeneration.
3. Merge SSO/settings/IPC stack `b58de5a1` into detached validation commit `09214ca9`. No production-source conflict occurs. The account-controller test additions merge automatically.
4. Resolve the workflow overlap by retaining the logging, IPC-bound and SSO checks as separate steps. Retain the unsigned macOS ASAR gate. A parsed-workflow inspection confirms all four named checks occur exactly once.
5. For conflicting documentation only, retain the updater-side snapshot to allow source validation. This deliberately omits sibling documentation changes; final PR reconciliation must union and re-review the evidence, status, inventory and capability records. Do not use these temporary documentation choices as final resolution instructions.

The CAP-001 controller differs only by ELC-003's tested BUSY constant replacement; the bounded log writer is unchanged from CAP-001. Settings persistence/migration, AuthorizedIpc, SavePictureIpc, SingleSignOn and WindowUtil match `b58de5a1` exactly. Pairwise overlap output is retained under `/tmp/reconcile-*.txt`; those files are exploratory evidence, not a final conflict-resolution patch.

The checkout has its own dependency installation, not a symlink. `yarn install --immutable --mode=skip-build` succeeds. `yarn configure` successfully obtains public configuration v0.34.6 and copies 39 files. Actual resolution verifies copy-config 2.3.13 with the awaited-pipeline/exclusive-archive patch and axios 1.20.0, alongside tooling axios 0.34.0. This confirms that PKG-001's downloader patch and ELC-003's transport update coexist.

## Local validation at 09214ca9

| Check on composition | Result / evidence |
| --- | --- |
| Root/tooling/Playwright/Electron test types | Pass; `/tmp/tst006-composed-types.log` |
| Renderer | 80 tests in 12 suites pass; `/tmp/tst006-composed-react.log` |
| Account state/queue/profile, account control/events, authorization, picture-save and bounded logging/maintenance | 100 Node cases pass; `/tmp/tst006-composed-node-contracts.log` |
| Settings migration/persistence | 34 owned-filesystem cases pass; `/tmp/tst006-composed-settings.log` |
| SSO diagnostic/external-opening boundaries | Nine inert Node cases pass; `/tmp/tst006-composed-sso.log` |
| Certificate/updater dependencies and updater startup/policy | 53 Node cases pass; `/tmp/tst006-composed-updater-deps.log` |
| Full tooling | 376 cases pass; `/tmp/tst006-composed-bin.log` |
| Production build/bundle | Pass with existing bundle-size/Browserslist warnings; `/tmp/tst006-composed-build.log` |
| Aggregate code lint | Pass; `/tmp/tst006-composed-lint.log` |
| Installed production graph | 354 production/optional/peer instances; six absent optional/peer edges; `/tmp/tst006-composed-production-graph.json` |

The graph is not an ASAR inventory or a fresh advisory audit. Prior ELC-003 advisory dispositions remain historical; actual shipped dependencies still require review. Node adapters use inert Electron ports; none of the above executes a native app, GUI Playwright, real signing or update feed.

Core reproduction commands (from the detached checkout):

```sh
node .yarn/releases/yarn-3.3.1.cjs install --immutable --mode=skip-build
node .yarn/releases/yarn-3.3.1.cjs configure
node .yarn/releases/yarn-3.3.1.cjs test:types
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node .yarn/releases/yarn-3.3.1.cjs test:react --runInBand
node .yarn/releases/yarn-3.3.1.cjs test:bin
node .yarn/releases/yarn-3.3.1.cjs lint:code
node .yarn/releases/yarn-3.3.1.cjs build:ts
node .yarn/releases/yarn-3.3.1.cjs bundle
```

Targeted Node contracts (no native application):

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/accounts/AccountControllerQueue.test.main.ts \
  electron/src/accounts/AccountState.test.main.ts \
  electron/src/accounts/AccountProfile.test.main.ts \
  electron/src/security/AccountControlIpc.test.main.ts \
  electron/src/security/AccountEventIpc.test.main.ts \
  electron/src/security/AuthorizedIpc.test.main.ts \
  electron/src/security/SavePictureIpc.test.main.ts \
  electron/src/logging/boundedLogAdmission.test.main.ts \
  electron/src/logging/boundedLogWriter.test.main.ts \
  electron/src/logging/logMaintenance.test.main.ts
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/settings/SchemaUpdater.test.main.ts \
  electron/src/settings/ConfigurationPersistence.test.main.ts
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-sso-context.cjs \
  electron/src/sso/SingleSignOnDiagnostics.test.main.ts
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/lib/CertificateDependency.test.main.ts \
  electron/src/update/UpdaterDependencies.test.main.ts \
  electron/src/update/updaterStartup.test.main.ts \
  electron/src/update/macosAutoUpdater.test.main.ts
```

Keep the checked-in settings/SSO Node adapters on those commands. Native suites are not authorized on the shared display.

## Log-export recomposition — September 22

Latest detached validation commit: `a795057b044beba6375fd2eb07bcb55d04f100cc`; tree `0af6b5573db1240cd1705463c3e3c1bdaa741d78`. This merges scoped CAP-004 `39bdfe5c` into `09214ca9` without conflicts. Integration and implementation branches remain unchanged. The initial temporary documentation choices above still prohibit treating this checkout as the final handoff tree.

F-017 fixes failed log exports truncating a prior user-selected destination. Baseline `5367256f` records ten controls passing and two preservation failures. The candidate writes a complete ZIP in an adjacent private directory and publishes by rename, with mode0600 output and owned cleanup. Earlier publication/cleanup/preservation sensitivities remain attributed to the scoped candidate, not rerun here.

On `a795057b`, all68 Node logging cases, root/tooling/Playwright/Electron test types, aggregate code lint and production build/bundle pass. Existing webpack performance/Browserslist warnings remain. Logs `/tmp/tst006-recomposed-{logging,types,build,lint}.log`. The Node settings adapter supplies an owned user-data root; the actual Electron `logPaths` test is deliberately not claimed. The logging command is:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/logging/{boundedLogAdmission,boundedLogWriter,desktopLogWriter,logCleanup,logCleanupScheduler,logDirectoryAncestors,logDirectoryCleanup,logExport,logExportRecovery,logFiles,logMaintenance,logRetention,logStartup}.test.main.ts
```

The preceding376 tooling/80 renderer/other contract results remain evidence for `09214ca9`; they were not rerun after this logging-only change. Final complete hosted/platform acceptance on the eventual PR-composed head is still mandatory. The [inventory](inventory-reconciliation.md) is refreshed to485 paths for this exact new target, with no review-completion claim.

## Latest retained PR62 E2E diagnosis — September 22

Read-only inspection of [run35035967615](https://github.com/adamlow-wire/wire-desktop/actions/runs/35035967615), Linux job104605123525, at PR62 head `a1cb2b84c2ba90c75a674865371c74334adcc548` confirms the first failing call test encounters a hosted-webapp runtime exception during Connect. No application, browser, workflow or remote write was launched for this inspection.

Artifact10425526364 (`playwright-blobs-linux`, 4,567,366,137 bytes) remained available. Bounded HTTP range reads recovered the inner report, first error-context attachment and both first-attempt trace archives. Each recovered member passes its ZIP CRC; the whole artifact SHA-256 was **not** verified. Its reported digest is metadata only. Raw data stays mode0600 under `/tmp/tst006-pr62-*` and must not be committed or shared: traces contain account/network credentials. No full-artifact download was needed.

The report records112 attempts:58 passed,48 failed and6 timed out. This is18 exhausted distinct failures, not54 distinct failed tests. The report's two `findDOMNode` strings occur only in embedded historical Git-diff metadata; they are not runtime evidence. The error-context snapshot shows the conversation screen without a search input. The standard Playwright trace covers the other browser context and contains no `findDOMNode` exception.

The separate Electron-app trace supplies the decisive evidence:

| Trace event | Monotonic time (ms) | Observation |
| --- | --: | --- |
| Connect click begins (`call@255`) | 36142.030 | Exact `go-people` test-id selector |
| Browser console error | 36186.652 | `TypeError: n.findDOMNode is not a function`; `performExit` / `updateStatus` / `componentDidUpdate` stack from `wire-webapp-dev.zinfra.io` |
| Webapp error-fallback diagnostic | 36187.471 | Same exception |
| Click completes | 36195.597 | No Playwright click error |
| Search fill begins (`call@257`) | 36200.400 | Existing `#start-ui` / `Search people` selector |
| Search fill fails | 66201.134 | Thirty-second wait expires |

Recovered members inside `report-linux.zip`: first error context `resources/76034d49a7790728f62ca36cdc03b1fc72986246.markdown` (6,087 bytes), ordinary trace `resources/9ec76c5ca97f38877ae7b4e7771b9946f45eef1c.zip` (62,246,692 bytes), app trace `resources/b5ccf62af4b0c50dc783bda793cfb51c4b02cc94.zip` (32,293,084 bytes). Inspect JSONL in the app archive's `trace.trace` without launching a viewer; sanitize network URLs, arguments and account data before emitting any extract. Local bounded retrieval scripts are `/tmp/tst006-artifact-{context,trace,app}.py`; they retain credentials only in memory and validate the artifact-storage redirect and range lengths.

Disposition: this independently corroborates the earlier hosted-webapp exception on the latest retained Linux head. It does not identify the source-level webapp repair, establish every failed test/platform's cause, or prove the desktop candidate regression-free. Do not change the locator, extend its timeout or waive E2E on this evidence. Next requires an authorized repair or known-compatible hosted test endpoint, followed by the unchanged assertions and final composed all-platform E2E. The previously requested hosted-webapp access/endpoint decision remains pending; do not silently switch environments. Windows native cleanup failures remain a separate investigation.

## Windows secure-shell diagnostic preparation — September 22

Retained [Windows job104613143821](https://github.com/adamlow-wire/wire-desktop/actions/runs/35038585587/job/104613143821) at packaging head974dcfa7 reports29 passes/one ten-second timeout in `SecureShellController`'s lifecycle/disposal test. Its log has no operation-level progress and uploads no native failure artifact because `test-results/` is absent. Local evidence: `/tmp/electron-return-windows-ci.log`. This test does not call `deleteAccount` or session cleanup. The separate account-cleanup stall is not evidence of this timeout's cause.

The scoped TST-006 branch now adds fixed phase labels to this existing test and reports the last phase from the failure hook. Labels distinguish controller startup, initial assertions, duplicate-start denial, popup denial, navigation denial, resize, visibility and disposal. No production code, assertion, timeout, navigation destination or cleanup operation changes. A following test resets the label. This is diagnostic preparation, not a Windows fix or a passed native test.

Scoped lint passes. A Node VM check executes the actual test registration/failure hook with an inert permanently pending controller: it emits only the fixed controller-start label and suppresses stale diagnostics after reset. Omitting the diagnostic from the in-memory fixture makes that check fail; restored check passes. No Electron module or browser is loaded. Script `/tmp/tst006-check-lifecycle-diagnostic.cjs`; logs `/tmp/tst006-lifecycle-diagnostics-{hook-restored,sensitivity,lint}.log`. The first scratch harness accidentally collected nested hooks; its failure is retained in `hook.log`, and the corrected harness selects only the target suite.

The report branch's older source imports dependencies intentionally absent from the composed candidate's installation, so its initial whole-project type check fails with five missing-module errors (`types.log`). A temporary test-file-only overlay on clean composeda795057b passes Electron test types (`composed-types.log`) and is restored in `finally`; the detached checkout is clean afterward. This evidence does not qualify the report branch as a complete runtime candidate. The485-path inventory remains pinned to a795057b and does not include this later diagnostic delta.

Next: include this test-only diagnostic when reconciling the actual scoped candidate, and obtain one authorized final-head Windows native result. Use its phase evidence before changing behavior or timing. Fork publication remains pending; no hosted job was dispatched. Continue independent source review while that authorization is unavailable.

## Test-only recomposition — 65e258ab

Latest detached validation commit `65e258abe940a71bcf1087b3cc7e49656f1c9254`, tree `9f1423c6b4987363a195aecd5883732e23da40b1`, follows a795057b. It copies the four reviewed test files from scoped audit candidates: secure-shell phase diagnostics173b6289, directory/cleanup characterizations7b7f09e5 and platform-newline assertionb49d64f9. It does not merge the report branch's older runtime or documentation tree. Production/dependency/workflow source is byte-identical to a795057b. The original temporary documentation-resolution warning still applies: this is not a handoff-ready integration commit.

On this exact target,98 Node logging/account-cleanup cases pass together; root/bin/Playwright/Electron test types and aggregate code lint pass. The native secure-shell diagnostic was type/lint checked, not executed. Earlier376 tooling and80 renderer results remain labeled09214ca9 evidence, and the prior production build remains a795057b evidence; none is relabeled as a new full-head run.

Commands from `/tmp/wire-tst006-reconcile`:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/logging/{boundedLogAdmission,boundedLogWriter,desktopLogWriter,logCleanup,logCleanupScheduler,logDirectoryAncestors,logDirectoryCleanup,logExport,logExportRecovery,logFiles,logMaintenance,logRetention,logStartup}.test.main.ts \
  electron/src/accounts/AccountLogCleanup.test.main.ts electron/src/lib/accountLogDeletion.test.main.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.bin.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.playwright.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js --ignore-path .gitignore --ext .js,.jsx,.ts,.tsx .
```

Logs `/tmp/tst006-test-recomposition-{contracts,types,lint}.log`. The checkout is clean after validation. The original-baseline inventory remains exactly485 unique paths with no status mismatches; annotations now identify the later test baselines and applied newline correction. Exact pending cells remain349 source-review/379 provenance/389 coverage; partial populated rows remain unfinished. Final complete integrated-head tests and actual Windows/macOS/Linux artifacts are still required.

No native process, remote write, protected MSI change or implementation/integration branch advance occurred. Next independent work is diagnostic confidentiality and remaining TST-006 review. When publication is authorized, include the scoped test-only deltas in the relevant final PRs and qualify actual Windows phases; do not publish this temporary composition as the final candidate.

## Dispatch diagnostic recomposition — 308fceb4

Latest detached validation commit `308fceb4`, tree `faff5d795d5c34e49226b326a84a30da5d2e24b3`, applies scoped SEC-013a2d77b19's CoreProtocol source/test and later navigation testsdfb19f0a to65e258ab. Exactly three paths differ: one production catch diagnostic and two tests. No dependency or workflow change. These selective copies avoid merging the scoped branch's old integration-era documentation into the validation checkout. Its existing temporary-documentation warning still prohibits treating this snapshot as a final handoff merge.

All29 dispatch/navigation Node cases pass on this exact head. Root/bin/Playwright/Electron test types, aggregate code lint and production TypeScript/webpack build pass. Existing Browserslist and bundle-performance warnings remain. The checkout is clean. No native Electron/window registration, authenticated E2E, OS installer or signed operation ran. Earlier98 logging/account-cleanup cases remain65e258ab evidence; earlier376 tooling/80 renderer cases remain09214ca9 evidence, not newly rerun acceptance.

Commands from `/tmp/wire-tst006-reconcile`:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/lib/CoreProtocolDiagnostics.test.main.ts \
  electron/src/accounts/loadAccountDestination.test.main.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.bin.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.playwright.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js --ignore-path .gitignore --ext .js,.jsx,.ts,.tsx .
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/webpack/bin/webpack.js --env production
```

Evidence `/tmp/tst006-dispatch-composed-{tests,types,lint,build}.log`. The exact original-baseline inventory is486 unique paths, including the new dispatch regression file. Pending cells341 source-review/370 provenance/380 coverage remain, with partial populated entries explicitly unaccepted. SEC-013's original native CoreProtocol routing/registration and full final-platform checks remain required. No remote or implementation/integration branch mutation occurred; only this detached validation snapshot advanced.

Next independent work: remaining generic background/configure error flows and source/coverage review. Add the scoped SEC-013 PR to the existing sequence after its actual integration dependencies qualify; the temporary composition is not a replacement for that PR.

## Proxy transport recomposition — 73f76118

Latest detached validation73f76118, tree37025ca1124b1d29f29d9c6c6cd2fa8774b547aa, adds CAP-0051381a854's proxy application initializer and regression to308fceb4. Only that initializer is replaced inside mainProcess; all unrelated composed startup/updater/security source remains intact. The new test is copied exactly. No dependency/workflow changes or old-base documentation merges. Temporary documentation in this checkout still disqualifies it as a final handoff tree.

All31 selected proxy application, automatic authentication, prompt actions/coordinator/registration cases pass on this exact head. Root/bin/Playwright/Electron test types, aggregate code lint and production TypeScript/webpack build pass. Existing Browserslist and bundle-performance warnings remain. The checkout is clean. These Node ports exercise configuration generation and caller behavior, not native Electron proxy resolution, HTTPS/SOCKS transport, OS authentication or enterprise services.

Commands:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/auth/{ProxySettingsApplication,ProxyLogin,ProxyPromptActions,ProxyPromptCoordinator,ProxyPromptRegistration}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.bin.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.playwright.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js --ignore-path .gitignore --ext .js,.jsx,.ts,.tsx .
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/webpack/bin/webpack.js --env production
```

Evidence `/tmp/tst006-proxy-composed-{tests,types,lint,build}.log`. Original-baseline inventory487 unique paths matches exactly. Pending cells341 source-review/370 provenance/380 coverage remain; mainProcess has partial F-007/F-019 dispositions, not full acceptance. Earlier29 dispatch/navigation cases remain308fceb4 evidence,98 logging/account cleanup remain65e258ab, and376 tooling/80 renderer remain09214ca9. No full final-head suite or native/platform qualification is claimed by these focused runs.

Next: retain a scoped CAP-005 PR after its actual integration dependencies and require final native proxy resolution/transport and supported-platform checks when authorized. Independent generic/configure diagnostic and remaining source/coverage review continues. No native app, proxy/network service, remote write, protected MSI change or implementation/integration branch advance occurred.

## Executable PR sequence and remaining gates

Once fork publication is explicitly authorized and PR62's failures are resolved, use scoped PRs in this order: CAP-001 → PKG-003 → SEC-003 → CAP-002 → PKG-001 → ELC-003 → PKG-002 → CAP-004 log-export recovery → SEC-013 dispatch diagnostics → CAP-005 proxy transport. Reconcile each with actual accepted integration, including all documentation and workflow checks, and require final-head protected checks. This dependency order is not permission to merge a failed PR or to reuse stale CI evidence. The detached validation merges are never substitutes for these PRs.

Independent work remains available while publication/profile decisions are pending: complete TST-006's module/provenance/coverage audit, diagnose retained Windows lifecycle and authenticated E2E failures from evidence, and prepare the final artifact and external-QA procedures. F-012 still requires the explicit existing-profile compatibility decision before changing ciphertext ownership.

The mandatory handoff still needs final composed Windows Squirrel/MSI, macOS and Linux artifacts, hashes, actual dependency/policy inspection, native and authenticated E2E success, complete review evidence and a residual release-QA ledger. Signing/notarization, signed update/rollback, released-installation migration, live SSO/E2EI/hardware, independent review and release-time Electron currency remain later release gates. Electron stays 43.4.0 for this unsigned handoff. No remote writes, upstream publication or Wire contact were made during reconciliation.

## Native proxy test recomposition — 2ea74556

Detached validation2ea74556 (treea24548a98a02b7890c4890d6a3321d81f83d4daf) copies exactly the three test/fixture files from CAP-005d204e2d5 onto73f76118. No production, dependency or workflow change. Existing31 Node proxy cases, Electron test types and targeted lint pass. Commands are the preceding proxy Mocha selection, `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json`, and ESLint on ProxySettingsApplication.test.main.ts, ProxySettingsNative.test.main.ts and electron/test/proxySettingsApplicationFixture.ts. Logs `/tmp/tst006-native-proxy-composed-{tests,types,lint}.log`.

Seven native cases are authored, not executed. They check Chromium resolution with actual session configuration but no connection or authentication. Native sensitivity remains required. Shared-loader Node sensitivity on scoped d204e2d5 fails6 after transport-prefix removal and restores9 passes. Exact inventory now489 unique paths; pending cells remain341 source/370 provenance/380 coverage, with partial populated rows. Earlier build/full-type/other-suite evidence stays attributed to its earlier heads. Final documentation reconciliation and all final integrated native/platform/E2E/package gates remain open; this detached checkout is still not a merge candidate.

## Startup proxy recomposition — 06b58f50

Detached06b58f50 (tree45786951d4a2209ff09ad5bc6aac944973a5f66c) adds only CAP-005d5e32f55 startup block and the exact baseline6c41d6f9 regression file to2ea74556. The earlier builder fix did not cover startup: null-origin validation rejected supported SOCKS, while unsupported URLs were retained and file switches appended before validation. The correction checks scheme/hostname before assignment or wrapper-owned file switch, clears state on failure and uses a fixed diagnostic. Existing native CLI switches are outside this JavaScript fixture.

Separate baseline6 pass/10 fail; corrected startup/application25 pass. Restored scheme/SOCKS/order mutations fail2/4/7. Before composition, the identical block/test overlay passes25 tests, Electron test types, production types with noEmit and targeted lint; all files restored. Final06b58f50 runs47 proxy startup/application/authentication/prompt Node cases using the previous Mocha command plus ProxyConfiguration.test.main.ts. Logs `/tmp/cap005-startup-composed-{tests,types,production-types,lint}.log` and `/tmp/tst006-proxy-startup-composed-tests.log`. No GUI/native process or remote write.

Inventory490 exact paths; pending cells341/370/380 remain plus partial rows. Native resolver/startup/transport/authentication, final full-head gates and documentation reconciliation remain required. This local validation composition is not a merge candidate.

## Terminal proxy lifecycle recomposition — 4441ef7a

Detached4441ef7a, tree8b9fad7c37ffe3b999004bdfdddd187f9c4765d7, copies exactly the coordinator, registration and registration-test files from CAP-0054a75a8bc (implementationcf9e228e) onto06b58f50. No other source/dependency/workflow changes. Native close now prevents failed actions from restoring retry authority; a consumed failed submission is cancelled after settling. Successful completion and live retry remain. Later tests cover both same-turn close/reject orderings, primary and cleanup error identity/delivery, and repeated close.

All55 selected Node proxy cases pass, as do Electron test types, production types with noEmit and targeted lint. Commands: the preceding proxy Mocha command including ProxyConfiguration; `tsc --noEmit -p tsconfig.mocha.json`; `tsc --noEmit -p tsconfig.build.json`; ESLint on the three changed files. Logs `/tmp/tst006-terminal-proxy-{tests,types,production-types,lint}.log`. The original baseline has490 exact unique inventory paths with no mismatch. Pending333/362/372 cells and partial rows remain. No native/GUI process or remote write occurred. Earlier bundle/full-suite evidence remains attributed to its earlier heads, not this commit.

This is a validation snapshot with incomplete final documentation reconciliation, not a merge candidate. Native close/session/authentication, final platform/E2E/package gates and remaining audit work still prevent handoff acceptance.

## Proxy window cleanup recomposition — b2c7433c

Detachedb2c7433c, tree71af8d851b205efedf7c27f976367509095f53aa, copies exactly ProxyPromptWindow.ts and ProxyPromptLifecycle.test.main.ts from CAP-0057787cc7c onto4441ef7a. The new lifecycle file has separate failing baseline69c00708. No other source/dependency/workflow changes. All58 selected Node proxy/window cases pass. Root/bin/Playwright/Electron test types, aggregate code lint, production TypeScript compilation and webpack production bundle pass on this exact head. Existing bundle-size/performance and Browserslist warnings remain; no native execution or actual package qualification follows from this build.

Commands:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/auth/{ProxyConfiguration,ProxySettingsApplication,ProxyLogin,ProxyPromptActions,ProxyPromptCoordinator,ProxyPromptRegistration}.test.main.ts \
  electron/src/window/ProxyPromptLifecycle.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.bin.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.playwright.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js --ignore-path .gitignore --ext .js,.jsx,.ts,.tsx .
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/webpack/bin/webpack.js --env production
```

Logs `/tmp/tst006-window-composed-{tests,types,lint,build}.log`. Exact inventory491 paths; pending332 source/361 provenance/371 coverage cells remain plus partial populated reviews. The checkout is clean. Older non-proxy suite results remain attributed to earlier heads. This validation snapshot still carries incomplete composed documentation and is not a merge candidate. Native auxiliary failure/close/identity/session behavior, final all-platform/E2E/unsigned-package gates and remaining review are mandatory.

## Proxy IPC test recomposition — 6e987dc5

Detached6e987dc5, treeb54d882adeeca4241ec129215537709303901f83, changes only ProxyPromptIpc.test.main.ts to exact335a91a8 content. Production, dependencies and workflows remain identical tob2c7433c. All74 proxy configuration/application/login/prompt/window/IPC Node cases pass together, as do Electron test types and targeted test lint. Logs `/tmp/tst006-proxy-ipc-composed-{tests,types,lint}.log`. Run the previous window Mocha command with `electron/src/security/ProxyPromptIpc.test.main.ts` appended; types use `tsc --noEmit -p tsconfig.mocha.json`, lint names the changed test only.

Exact original-baseline inventory491 unique paths, no mismatch. Pending329 source/358 provenance/368 coverage cells remain plus partial populated rows. Source/build evidence remains attributed tob2c7433c, not silently rerun. No native process or remote write. This is still a validation snapshot requiring final documentation reconciliation, remaining audit and actual final platform/E2E/unsigned-package gates.

## Account cleanup order recomposition — 5eef88e6

Detached5eef88e6, tree48a6c4295da0cf84b0eef3caea1738f8af9f18e3, adds exact98353af7 AccountSessionCleanupOrder.test.main.ts onto6e987dc5. Production/dependencies/workflows remain unchanged.108 Node logging/cleanup/retired-deletion IPC cases, Electron test types and targeted lint pass; clean checkout. Logs `/tmp/tst006-cleanup-order-composed-{tests,types,lint}.log`.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/logging/{boundedLogAdmission,boundedLogWriter,desktopLogWriter,logCleanup,logCleanupScheduler,logDirectoryAncestors,logDirectoryCleanup,logExport,logExportRecovery,logFiles,logMaintenance,logRetention,logStartup}.test.main.ts \
  electron/src/accounts/{AccountLogCleanup,AccountSessionCleanupOrder}.test.main.ts \
  electron/src/lib/accountLogDeletion.test.main.ts electron/src/security/AccountDataDeletionIpc.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountSessionCleanupOrder.test.main.ts
```

Exact inventory492 unique paths, pending323/351/361 plus partial dispositions. This proves inert cleanup orchestration and selected filesystem/logging behavior, not native Chromium session clearing or actual package qualification. Earlier74 proxy/window/IPC results remain6e987dc5 evidence; prior production build remainsb2c7433c evidence. Final documentation reconciliation and all final native/platform/E2E/unsigned-package gates remain mandatory.

## Profile recovery test recomposition — 68ce2478

Detached68ce2478, tree9dd6d01d88db067e152860b5600840fd3665b852, copies exactf5ae6ede AccountProfile.test.main.ts onto5eef88e6. Production/dependencies/workflows remain unchanged.48 selected Node profile/state/cleanup-order/retired deletion IPC cases pass; Electron test types and targeted lint pass. Clean checkout and492-path inventory accounting verified. Pending321/348/358 cells and partial reviews remain.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/accounts/{AccountProfile,AccountState,AccountSessionCleanupOrder}.test.main.ts \
  electron/src/security/AccountDataDeletionIpc.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountProfile.test.main.ts
```

Logs `/tmp/tst006-profile-composed-{tests,types,lint}.log`. Earlier108 logging/cleanup results remain5eef88e6 evidence;74 proxy/window/IPC remain6e987dc5; production build remainsb2c7433c. Actual native profile/data/session compatibility, ciphertext ownership, Windows lifecycle, final E2E/platform/unsigned-package gates and final documentation reconciliation remain outstanding. This temporary validation snapshot is not a final merge/handoff tree.

## Legacy reader cleanup recomposition — b2a72752

Detachedb2a72752, tree300ee700b884cdaf7f612d2699cd401693b0e908, copies exactly readLegacyAccountState.ts and readLegacyAccountStateLifecycle.test.main.ts from CAP-0010c7152bf onto68ce2478. No old-base documentation or unrelated source is merged. Separate baseline8dacee5c and restored setup/detach sensitivity are retained.

All59 selected profile/state/cleanup-order/reader/retired deletion IPC Node cases, Electron test types, production types with noEmit and targeted lint pass. Logs `/tmp/tst006-reader-composed-{tests,types,lint}.log`. Run the previous profile Mocha command adding readLegacyAccountStateLifecycle.test.main.ts; types use tsconfig.mocha.json and tsconfig.build.json with noEmit; lint names the two changed files. Native readLegacyAccountState.test.main.ts is deliberately excluded under the shared-display restriction.

Exact inventory493 unique paths; pending319/346/356 plus partial rows. Checkout clean. Earlier production bundle and other suite results retain their earlier-head attribution. Native debugger/storage/window cleanup, destruction failure, profile/ciphertext compatibility and all final platform/E2E/package gates remain outstanding. Temporary documentation reconciliation still prevents treating this snapshot as a merge/handoff candidate.

## Queued authority test recomposition — 00a88ae2

Detached00a88ae2, treeaffa4db8f0719f9f436eddbdd0057cd894a60926, copies exact209c9b8b AccountControllerQueue.test.main.ts onto b2a72752. Production/dependencies/workflows unchanged.86 selected Node queue/profile/state/cleanup/reader/IPC cases pass, together with Electron test types and targeted lint. Checkout clean;493-path inventory exact, pending319/345/355 plus partial dispositions.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/accounts/{AccountControllerQueue,AccountProfile,AccountState,AccountSessionCleanupOrder,readLegacyAccountStateLifecycle}.test.main.ts \
  electron/src/security/{AccountDataDeletionIpc,AuthorizedIpc,ProxyPromptIpc}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountControllerQueue.test.main.ts
```

Logs `/tmp/tst006-queue-composed-{tests,types,lint}.log`. Prior production/build/other-suite evidence retains original-head attribution. The selected controller queue fixture is inert; native authority/consent/navigation and full controller recovery remain open. All final native/platform/E2E/unsigned-package, profile/ciphertext compatibility and documentation reconciliation gates remain outstanding. This validation checkout is not a final merge/handoff tree.

## Controller removal characterization — 5112c50a

Test-only374125ab is composed on00a88ae2 as5112c50a, tree24e077807bc9eeaaa24fe6b58bf41a45b1b1287c.90 Node controller/queue/profile/state/cleanup/reader/IPC cases, Electron test types after source restoration and targeted lint pass. Production is unchanged and the checkout is clean.494 original-baseline inventory paths match exactly. [Removal review](account-controller-removal-review.md) records four sensitive stage/retry tests and the separate native failure-ownership gaps. Prior build evidence retains its original head; final documentation reconciliation, native/platform/E2E/package gates and pending decisions remain required.

## View setup cleanup — 5ad76db6

Scoped CAP-001554fc245 source and AccountViewsSetup.test.main.ts are composed exactly as5ad76db6, tree1fc4264b0841538ba09f38708cac123400e5cae4.101 selected Node cases, Electron test types, production types and targeted lint pass.495 original-baseline paths match the inventory. Source-sensitive setup checks use an extracted actual class/real registry with inert native ports; no Electron process was launched. Runtime changes only setup cleanup/reservation, preserving existing policy. Native teardown failure ownership, full review, final platform/E2E/unsigned-package and documentation reconciliation remain open. Earlier bundle evidence retains its original head.

## View teardown recovery — 1a5363f3

Scoped8d8fe8cd AccountViews source and setup/teardown tests are copied exactly onto5ad76db6 as1a5363f3, tree7adc8c1d8de9d48ca7ce0e60b6a960298aa7e500.110 selected Node cases, Electron/production types and targeted lint pass.495 inventory paths match the original-baseline delta. This corrects reproduced teardown ownership and callback handling locally; actual native lifecycle/permission-session behavior and retained Windows failures remain open. Final documentation reconciliation and all final platform/E2E/unsigned-package gates are still required.

Production TypeScript emission and webpack production bundle also pass at1a5363f3 (`/tmp/cap001-view-teardown-build.log`); existing Browserslist/performance warnings remain. Checkout clean. No native/package acceptance follows from bundle compilation.

## Permission lifecycle characterization — ead3eff0

Exact29cf098d test-only delta is composed asead3eff0, tree1f9163ecfa669dd8055222eeb2d70ba59a112d78.129 selected Node cases, Electron test types and targeted lint pass; runtime/dependencies unchanged.496 original-baseline inventory paths match. Production build evidence retains1a5363f3 attribution. [Permission review](permission-session-review.md) records source/provenance/coverage limits; native partial setup/disposal failure ownership and final native/platform/E2E/package gates remain open.

## Account IPC wiring qualification — 1d7c2a52

Exact9bc86c79 test-only delta is composed as1d7c2a52, tree4be8d70e4b8aadba3dd886b84aea5cf4e6053e94.147 selected Node cases, Electron test types and targeted lint pass. Runtime/dependencies unchanged;496 original-baseline paths match. Account-control exact local URL and awaited removal are sensitive; native consent fixtures were inspected only. Earlier production build retains1a5363f3 attribution. Final renderer/native/platform/E2E/package and documentation reconciliation gates remain open.

## Renderer bootstrap recovery — 7a3b6e72

Exact59ae067b renderer source/tests are composed as7a3b6e72, tree8545910eeab9a869f9e957a3fc0a521b127cdbe3.82 renderer cases/12 suites,4 preload bridge Node cases, root/Electron test types and corrected targeted lint pass.496 original-baseline inventory paths match. Prior147 account/IPC/permission Node evidence retains1d7c2a52 attribution. Actual native startup, downstream consumer review, main publisher failure handling and final gates remain open.

Production TypeScript/webpack build also passes at7a3b6e72 (`/tmp/cap001-store-build.log`); existing warnings remain. Checkout is clean. No native/package acceptance follows from bundle compilation.

## Capture cleanup recovery — 40f9b191

Scoped CAP-0038727695e source/test delta is composed exactly as40f9b191, treeb1df821b631f827aebdd3a4aef4ed9fc55596dec.17 capture cleanup/contract Node cases, Electron/production types, lint and production TypeScript/webpack build pass (`/tmp/cap003-cleanup-build.log`); existing Browserslist/performance warnings remain.497 original-baseline inventory paths match. Other-suite evidence retains its original heads. Checkout clean. Local teardown settlement/retry does not prove native capture termination; full native/constructor/permission/port/platform/E2E/package and documentation reconciliation gates remain open. The scoped branch is fix/CAP-003-capture-cleanup-2026-09-22; no remote publication occurred.
