# TST-006 execution ledger

This is an open internal review, not acceptance or independent REL-001 review. Follow [the execution plan](quality-review.md). No completion percentage or full-coverage claim is made.

## Verified scope and checkpoint

The original modernization baseline is `1b82b085ac1436a7f21d81cb944d2ee2f4ba4a4a`. Its ancestor upstream `e1ba98c50dce28b26b05466169fbdf941f0285f3` has identical application/tooling inputs (`git diff e1ba98c5 1b82b085 -- electron bin package.json yarn.lock` is empty); the intervening three commits are documentation. The full baseline-to-functional-checkpoint `6e27c614` diff contains 423 paths, including subsequent upstream/MSI integration. Origin does not exempt retained code from composed review.

[PR61](https://github.com/adamlow-wire/wire-desktop/pull/61) integrates the review plan as `897e3930392fdc9479f9641c8c03f116947d4e95`. Reviewed `7a3e875a`, tested synthetic `ede3cb84` and actual merge share tree `f9f7a380c97bd8d0a97bf9988a1e327ceaa8ba5f`. All ten strict checks, admin/conversation enforcement, no unresolved threads and SHA guard passed. [Build](https://github.com/adamlow-wire/wire-desktop/actions/runs/35010907386), [lint](https://github.com/adamlow-wire/wire-desktop/actions/runs/35010907499), [CodeQL](https://github.com/adamlow-wire/wire-desktop/actions/runs/35010907384) and [full E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/35010907346) pass. All 76 E2E cases/platform passed initially; report job `104535071887` passes. Exact CodeQL analysis `1781510397` reports zero findings/no error.

[Native/package run](https://github.com/adamlow-wire/wire-desktop/actions/runs/35010907311) passes after one unchanged-head failed-job rerun: Linux `104525933836`, Windows `104525934283`; macOS passed initially in `104522324872`. Initial Linux capture Stop timed out after 20 seconds; initial Windows controller setup timed out after ten seconds at “starting account views.” These are retained under F-002, not diagnosed by their successful reruns. Protected MSI worktree remains `255bdd54`; no shared-display tests or installed application were used.

[Module inventory](review-inventory.csv) accounts for the complete original delta plus current queue work. An initial source pass does not close test provenance, counter disposition or final composed review. [Behavioral traceability](review-traceability.csv) starts with every DCP, INV and incoming IPC channel, including dormant channels and separate SSO/proxy operations. Pending cells are deliberately unaccepted; command variants and main-to-preload contracts still need detailed mapping. These ledgers must be updated as the candidate changes.

## Findings and remediation

| ID | Severity / owner | Evidence and consequence | State / required follow-up |
| --- | --- | --- | --- |
| F-001 | Handoff evidence gap / TST-001, TST-006 | Fresh hosted counters omit actual application E2E execution; `mainProcess.ts` has 0/381 statements despite real product tests. Existing diff gate is not a full-baseline/per-module report. | Open: improve collection/reporting, audit exclusions, test reachable gaps and disposition every remainder. |
| F-002 | Medium test reliability / TST-005, CAP-003, CAP-001 | Repeated native capture cancellation/Stop timeouts and a separate account-startup fixture timeout, including PR61. Waiting for an inspector reply from a closing broker is a hypothesis, not established cause. | Open: bounded stage diagnostics and sensitive regression; preserve actual Stop/track/owner assertions, record all attempts. |
| F-003 | Candidate resource-lifetime issue / SEC-003 | `AuthorizedIpc` rate-limit map retains webContents IDs for binder lifetime without eviction. | Open investigation: quantify lifetime/bounds and choose a tested remedy if needed. No privilege bypass established. |
| F-004 | High package input inclusion / PKG-001 | Real packager copy-filter traversal of synthetic Windows/macOS workspaces copies `.env`, `e2e-tests/.env`, `keys/example-private.pem` and test-result traces. macOS also has a source-exclusion typo. | Open: restrictive reviewed runtime file policy, sensitive copy fixtures and real artifact content checks. |
| F-005 | High credential-bearing diagnostics / PKG-001, INV-010 | Build CLI recursively logs macOS configuration, including `notarizeApplePassword` and `osxNotarize.appleIdPassword`. | Open: synthetic logger-capture baseline and safe diagnostics; no actual credential exposure is asserted. |
| F-006 | High packaging failure/order defects / PKG-001, SEC-011 | Windows/macOS wrappers swallow packager/fuse failures; several wrappers mutate files before restoration `try`; automatic macOS signing may precede fuse changes; manual signing uses `execAsync`, which swallows command failure. | Open: fault-injected restoration/error/order tests and fixes. Actual signed verification remains Wire/M5. |
| F-007 | Medium retained updater defect / PKG-002, DCP-019 | The internal macOS updater is inside a second `ready` listener registered after startup; normal startup never reaches it. Inherited upstream `19268e651`, still present in composition. | Open: sensitive startup/update-routing test and scoped fix. Do not activate updates in unsigned preview fixtures or claim signed-update qualification. |
| F-008 | High unbounded queued payload retention / CAP-001, INV-010 | A pending native environment approval holds the controller queue indefinitely. Safe Node-only reproduction accepts 600 tiny metadata events with none rejected; the IPC contract permits 600/minute and up to 2 MiB picture values. No large allocation/OOM test was used. | Local candidate fixes the queue at 32 active/queued operations. Baseline `8cd6bd18`, sensitivity and local tests below; final native/product/platform qualification still required. |
| F-009 | High sensitive SSO diagnostics / CAP-002, INV-010 | A Node-only synthetic window/event adapter confirms `fixture-secret-only` reaches the actual SSO console log-writer call unchanged. Native initialization errors also propagate from a URL containing a callback secret; actual native error formatting remains to be qualified. | Open: replace raw authentication-page/error diagnostics with safe bounded events and sensitive tests. The console path is confirmed; no real credential exposure incident is asserted. |
| F-010 | High settings loss / PKG-003, DCP-021, INV-010 | Migration moves legacy over current before parsing, then writes shared defaults after a parse failure. Malformed contents reach logs. Ordinary reads also substitute defaults for corruption; writes are not atomic and failures are swallowed. | Local remediation and separate baselines `b122d801` / `f5f8684c`; see [settings recovery](settings-recovery.md). Native/cross-platform qualification and final review pending. |

High findings block handoff. A source observation labelled candidate is not a confirmed exploit. Lower-severity entries still require a reviewed disposition, not automatic acceptance.

## Coverage and baseline provenance audit

Fresh accepted-runtime [integration build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34997388051) artifact `10407783188` contains Electron **4397/5340 statements, 2326/2793 branches, 997/1315 functions** across 176 files, and renderer **282/478 statements, 141/269 branches, 78/148 functions** across 32 files. These are counter totals, not product completion. All maintained main TypeScript files are present except `runtime/wallClockLoader.mts`; JavaScript/tooling/native behavior requires separate accounting. Renderer test/spec files are excluded appropriately. Local September 10 coverage is stale and is not accepted evidence.

There are uncovered counters in 74 main and 24 renderer modules. The shell still runs the React/Redux renderer: it cannot be excluded wholesale as legacy. Some retained actions/context-menu helpers appear dormant and need graph proof. Six composition-root ignore comments require review; real E2E execution outside collection does not justify claiming instrumented coverage. Source search found no `.skip`, `.only` or `fixme` test declarations; conditional execution, mocks and actual CI consumption remain under review.

Verified history examples, not a blanket baseline-first verdict:

- `b31f4b60` adds only preview metadata characterization before parser replacement `6d7760fc`; original-run/sensitivity evidence still needs durable mapping.
- `e3fbd6a2` adds native permission callback characterization before permission foundation `565035fe`. That foundation adds its policy and policy tests together; these tests cannot be called pre-refactor legacy evidence or observed originally failing targets without further evidence.
- Current queue baseline `8cd6bd18` is a later security regression, not an original modernization baseline. Before the fix, ordering and stale-authority tests pass and overload rejection fails. An initial test expectation used the wrong authorization error wording; correcting it to the existing registry error produced the recorded two-pass/one-fail result without changing production.

## Dependency audit

The Yarn recursive production audit is incomplete for this purpose: it reports a transitive development Axios version while omitting advisories specific to shipped Axios 0.21.2. The actual [preview artifact](https://github.com/adamlow-wire/wire-desktop/actions/runs/34993542942/artifacts/10407101912) ASAR contains 433 installed package instances/370 distinct names. Querying the official npm bulk advisory endpoint with these exact names/versions returns 16 affected names/76 version-range advisories. These are advisory matches, not 76 demonstrated application vulnerabilities.

Only real `node_modules` package roots count. Nested dependency fixture manifests were removed before the final query; a test fixture whose name collides with a malware advisory is not evidence that the malicious package is installed. Production graph, tooling graph, actual reachability and compatibility remediation remain ELC-003 work.

Most affected protobuf/documentation tooling comes through `@wireapp/protocol-messaging`, currently imported by desktop only for `Availability.Type.BUSY`. Verify enum compatibility before removing that unnecessary runtime dependency. Other candidates are compatible certificate-parser/updater/YAML/UUID updates and maintained Joi, with existing schema, certificate and deployment contracts protected first. Electron stays 43.4.0; no blanket latest-major update is authorized by this audit.

The preview archive was inventoried, never launched locally. Its environment filenames are only `.env.defaults` and `e2e-tests/.env.tpl`; no `keys` or test-results directory was found. This targeted check identifies no actual private environment/key inclusion, but is not proof that every archive byte is secret-free and does not resolve F-004.

## Current CAP-001 reproduction and validation

Run without Electron or native windows:

```sh
node .yarn/releases/yarn-3.3.1.cjs mocha --require .babel-register.js electron/src/accounts/AccountControllerQueue.test.main.ts
node .yarn/releases/yarn-3.3.1.cjs tsc -P tsconfig.mocha.json --noEmit
node .yarn/releases/yarn-3.3.1.cjs eslint electron/src/accounts/AccountController.ts electron/src/accounts/AccountControllerQueue.test.main.ts
```

The fixture uses real controller/state/registry objects, an in-memory profile and inert view adapters. The three local tests pass, and the combined queue/state/profile run passes 40 cases; Mocha types and scoped lint pass. These tests preserve FIFO/copied payloads, reject 31 stale queued events without state changes, restore all 32 slots for a replacement identity, reject overload while approval is pending and recover after cancellation. They do not replace native IPC or actual dialog/platform tests.

Temporary removal of payload copying fails the exact ordered-name assertion; removal of queued authority checking fails expected rejection. Removing the new limit fails immediate overload rejection; removing slot release fails both replacement-identity and post-cancellation recovery. All perturbations are restored. Local scratch logs use `/tmp/tst006-queue-*`; the separate baseline and PR CI must provide durable reproduction, not dependence on those temporary files.

Next: qualify and integrate F-008, investigate F-002, remediate packaging/dependency findings under existing owners, continue every review/traceability/coverage row, then perform final composed unsigned qualification. Signing, live Keycloak/E2EI, actual OS/hardware gaps and independent review remain the explicit later gates in the plan.

## PKG-003 settings baseline and remediation

The original migration fixture passes three legacy cases and fails five security targets. Persistence passes four cases and fails three targets. Both baselines were committed before their corresponding source changes. The initial migration fixture used noncanonical window keys; a correction to `SettingsType.FULL_SCREEN` (`fullscreen`) and `SettingsType.WINDOW_BOUNDS` (`bounds`) also passes against the original source. No intended deletion of those values is activated: the old deletion block was unreachable for JSON input because the shared schema supplied `configVersion` first.

Local Node-only filesystem tests now pass 26 cases; two environment-selection failure cases also pass. Removing legacy value copying breaks characterization. Omitting the persistence flush or replacing exclusive migration publication with rename breaks the relevant regression. All perturbations are restored. Native Quit/menu tests are authored but not run on the shared display; their hosted selection is explicit. Read/write failures now use generic diagnostics. Failed saves preserve the previous file, preserve environment selection and still allow Quit. Full released-version fixtures, installer rollback and signed-platform validation remain M5.

The extended Node-only run passes 37 cases (32 settings and five EnvironmentUtil). Focused Babel/Istanbul counters cover 36/36 statements and 19/19 branches in SchemaUpdater, and 50/50 statements and 18/18 branches in ConfigurationPersistence. This includes unavailable runtime path, already-loaded settings, invalid in-memory values and cleanup failure. These module counters do not qualify native callers, real OS failure behavior, the complete application denominator or every supported released-version migration.
