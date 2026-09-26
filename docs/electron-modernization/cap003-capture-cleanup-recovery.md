# CAP-003 capture cancellation cleanup recovery — September 22

Main's snapshot publisher calls DisplayCaptureCoordinator.revalidate before delivering account snapshots. Review of its end path found that it removed the flow before native destruction and cleanup, while those operations could throw before rejecting the pending begin request or revoking remaining resources. Separate baseline82f6e965 reproduces four cases (destroy/listener cleanup/registration revocation/protocol uninstall), with1 control pass/4 failures. No real screen or window was used.

Ending now marks the flow ended, removes active authority, clears timer/source references and rejects cancellation once before attempting external cleanup. It attempts native destruction and every cleanup callback, retaining only failed callbacks and failed window ownership for retry. Failed teardown remains reserved by account and counts against the existing global four-flow cap. Revalidation and disposal retry it. A reentrancy guard prevents destroy-triggered lifecycle events from recursively tearing down the same flow. Cleanup errors emit only `Display capture cleanup failed.`; diagnostic failure cannot interrupt cancellation. The original late/unavailable owner notification remains best effort.

Additional baselinea389b683 adds retry-after-eligibility, global-cap and reentrancy targets. Against the initial uncommitted cleanup fix,7 pass/1 retry case fails; revalidation now retries an ended retained flow even when approval eligibility returns. All8 cases pass. Omitting cancellation settlement, dropping failed cleanup ownership, excluding failed owners from the cap, removing the reentrancy guard or skipping ended-flow revalidation fails8/6/1/1/1 cases. All mutations restore and8 pass again.

The fixture compiles actual coordinator fields/methods from source while omitting only constructor IPC registration. It seeds owned synthetic flows and supplies inert window/session/notification ports; it exercises actual revalidate/dispose/end/admission logic but does not prove native constructor wiring, real stream shutdown or OS capture behavior. The original coordinator source/native fixture originate ina90c6892; no separate original baseline is inferred.

A two-file overlay on composed7a3b6e72 passes17 Node capture-contract/cleanup cases, Electron/production types and targeted lint. One template-format lint correction changes only fixture formatting. Logs `/tmp/cap003-cleanup-{baseline,revalidation-baseline,fixed,restored,composed-tests,types,production-types,lint}.log` and `/tmp/cap003-cleanup-{cancel-settlement,cleanup-retention,global-cap,reentrant-guard,revalidation}-sensitivity.log`.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/calling/display/{DisplayCaptureCleanup,DisplayCaptureContract}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json
node node_modules/eslint/bin/eslint.js electron/src/calling/display/{DisplayCaptureCoordinator.ts,DisplayCaptureCleanup.test.main.ts}
```

This is a local CAP-003 follow-up, not closure of native capture qualification. When native destruction fails, the implementation retains ownership and blocks replacement rather than claiming physical capture has stopped. Actual OS/stream termination, constructor/source/permission/port lifecycle, partial multi-step cleanup callbacks and final platform/E2E/unsigned-package gates remain open. Retry is driven by revalidation/disposal; no new forced termination or busy-loop policy is added. Historical PR60 acceptance remains attributed to its original heads. No native process, device capture or remote write occurred.

## Composed build qualification

Exact8727695e source/test delta is composed as40f9b191, treeb1df821b631f827aebdd3a4aef4ed9fc55596dec. Production TypeScript/webpack build passes (`/tmp/cap003-cleanup-build.log`), with existing Browserslist/performance warnings.497 inventory paths match and the validation checkout is clean. This is bundle compilation, not native startup, capture termination or package acceptance.

## Main-owned message port recovery

Separate baseline8986305a reproduced unclosed main-owned endpoints when either postMessage failed (10 pass/2 fail). Fix26706fb8 registers cleanup immediately after channel allocation and relinquishes each endpoint only after its transfer returns successfully. Failed close retains cleanup ownership for retry. Successfully transferred endpoints are not closed by main.13 cleanup cases passed; omitting close failed3 and retaining transferred ownership failed4, then restored13 passed. Composition4b1eb667 (treef35a4a798ff5305c0bc0ff06dea40e2fea400126) passed22 cleanup/contract Node cases, Electron test types, targeted lint and production TypeScript/webpack build with existing warnings. These results were observed September22; their temporary logs disappeared during the September23 environment transition.

The fixture models transfer ownership with inert ports. It does not qualify native transfer atomicity on exception, native port closure, constructor/session setup or OS stream termination. CAP-003 remains open.

September23 recovery validation: recovered exact4b1eb667 passes all22 inert Node cleanup/contract cases again (388ms), using the surviving root-installed Mocha/Babel/TypeScript dependencies via normal ancestor resolution. This is not an immutable reinstall or fresh full-build qualification. Command from `wrap/worktrees/recovery-tst006-composed`: `node /home/sysop/wire/wire-desktop/node_modules/mocha/bin/mocha.js --require ./.babel-register.js electron/src/calling/display/DisplayCaptureCleanup.test.main.ts electron/src/calling/display/DisplayCaptureContract.test.main.ts`. The inventory was independently rechecked against4b1eb667:497 unique paths match exactly.

## Broker permission handler review — September23

Test-only14a1578e adds13 cases executing actual configurePermission handlers with inert setter ports. An exact, live broker in starting phase and a current eligible owner receives only media permission for a main-frame request with an empty mediaTypes array; one request consumes it. Only that broker main frame can subsequently consume one selected video source, requiring video, no audio and a user gesture. Invalid requests do not consume the allowance. Check/request/display callbacks retained after end deny because phase/currentness/window eligibility is rechecked. This validates callback policy, not native handler installation or OS capture.

Exact-document, media-once, display-once, exact-frame, starting-phase and current-owner mutations each fail1 case, then restore. The first starting-phase mutation survived because teardown also destroyed the window; an added live-window loading/choosing/active case independently detects it.26 cleanup/permission cases plus9 contract cases pass (35 total), targeted lint and strict standalone test typecheck pass. Production source remains unchanged. Composed7fbd3b7d (treeb47baa6b6fab040635ee097c982f8d118422cea6) repeats35 passes using surviving root dependencies, without implying an immutable install or full composed type/build pass.

Commands from the recovered scoped checkout:

```sh
node /home/sysop/wire/wire-desktop/node_modules/mocha/bin/mocha.js --require ./.babel-register.js electron/src/calling/display/DisplayCaptureCleanup.test.main.ts electron/src/calling/display/DisplayCaptureContract.test.main.ts
node /home/sysop/wire/wire-desktop/node_modules/eslint/bin/eslint.js electron/src/calling/display/DisplayCaptureCleanup.test.main.ts
node /home/sysop/wire/wire-desktop/node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --esModuleInterop --target ES2022 --module commonjs --types mocha,node electron/src/calling/display/DisplayCaptureCleanup.test.main.ts
```

Local logs are under `wrap/cap003-permission-evidence/`: six named mutation logs and restored/composed logs. Full constructor binding, partial setter/listener installation, session lifetime, cleanup callback partial failure and native transfer/OS lifecycle still require evidence. Next review the asynchronous loadURL fulfillment path: foreground/show/focus exceptions occur inside its success callback; its second then argument handles load rejection, not exceptions thrown by that callback. Reproduce settlement/cleanup behavior before modifying it.

## Broker startup fulfillment failure recovery — September23

Separate57c46a3b baseline yields2 pass/3 failures: load rejection already cancels, but foreground-check/show/focus exceptions reject the discarded fulfillment promise without cancellation cleanup. The actual class is compiled without constructor IPC registration; one AST instrumentation retains the otherwise discarded promise for assertions, without changing its handlers. Native allocations/registration/session are inert ports. The observation seam initially depended on formatting;8e8b5682 makes it whitespace-independent and re-proves the same2 pass/3 failures against original production.

Fix5ca6dbf6 moves rejection handling to a terminal catch covering load and fulfillment callbacks. Cancellation uses the existing fixed error, window teardown, listener release and registration/protocol cleanup. Success retains the chooser until later cancellation. Five startup cases plus35 existing cleanup/permission/contract cases pass. Replacing catch cleanup with a no-op fails4 cases, then restored40 pass. Targeted source/test lint and strict standalone startup-test types pass. Composition0a961791 (tree3f3d66d5948b8b0aa2698eaebe15533b50d11376) repeats40 passes using surviving root tooling. Full composed build/types and native startup are not freshly qualified.

Commands follow the preceding section, adding `electron/src/calling/display/DisplayCaptureStartup.test.main.ts` to Mocha and lint, and selecting that file for the standalone typecheck. Logs in `wrap/cap003-permission-evidence/`: `startup-baseline.log`, `startup-baseline-formatted.log`, `startup-fixed.log`, `startup-no-cleanup-sensitivity.log`, `startup-restored.log`, `startup-lint.log`, `startup-types.log`, `startup-composed.log`.

Next: partial synchronous setup/listener installation, constructor IPC binding rollback and session lifetime/handler disposal. OS permissions/stream shutdown and final platform/E2E/unsigned-package gates remain open. This local scoped correction does not replace historical native acceptance or authorize publication.

September23 restored-dependency checkpoint: unchanged0a961791 now passes root/bin/Playwright/Electron-test types,82 renderer cases,376 Node tooling cases,40 capture cases, targeted lint and production build on its own immutable installation with Node22.22.3. Nested checkout lint uses the unchanged local config explicitly to avoid inheriting outer plugins. Native/package qualification remains open; logs `wrap/cap003-permission-evidence/recovered-*.log`.

## Constructor IPC registration rollback — September23

Production mainProcess assigns its DisplayCaptureCoordinator only after construction and then installs the owning main-window closed callback. A synchronous duplicate-channel failure during construction therefore leaves no assigned coordinator to dispose. Separate baselined1df4fca executes the complete actual class/contract helper (constructor retained) with the real bindAuthorizedIpc and an inert IPC port that rejects duplicate handlers. Conflicts at registration positions2–6 leave earlier handlers installed:2 controls pass/5 cases fail. No native process is needed to reproduce this bookkeeping defect.

Fixce028312 disposes already-owned registrations when a bind throws, then rethrows the original error. It never acquires or removes the conflicting foreign registration. Seven tests cover successful six-channel registration, actual unauthorized-sender rejection, one-time disposal, conflicts at every position, preservation of the exact foreign handler, and clean retry after removing that foreign conflict. Omitting rollback fails5; deleting the foreign handler fails6; restored7 pass. The inert removeHandler port is nonthrowing as modeled here; exceptional native removal and full native constructor lifecycle are not qualified.

Composition1c301664 (tree436ecd6fadcd035ceedd3470c6cf13e6ec5d9e72) passes47 capture registration/startup/cleanup/permission/contract Node cases, Electron test types, targeted lint and production TypeScript/webpack build, using its own immutable dependencies and pinned Node22.22.3. Earlier82 renderer/376 tooling/full type-group evidence retains0a961791 attribution; those unrelated suites were not rerun for this narrow delta. Existing build warnings remain.

Commands are the previous capture command set with `DisplayCaptureRegistration.test.main.ts` added, plus `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json`; lint explicitly uses `--no-eslintrc --config .eslintrc.json` in the nested checkout. Local logs under `wrap/cap003-permission-evidence/`: `registration-{baseline,fixed,restored,composed,types,lint,build}.log` and `registration-{no-rollback,foreign-owner}-sensitivity.log`.499 inventory paths match. Next review partial synchronous flow/session/listener setup and session lifetime; do not equate this constructor fix with those untested cases or native acceptance.

## Synchronous broker setup characterization — September23

Test-onlyc9a542c1 extends the existing actual-method startup fixture through six synchronous failure ports: identity registration, permission check/request/display setters, popup policy and navigation guard installation. All six pass without a production change. After a flow is owned, its outer catch settles the fixed cancellation, destroys its window and uninstalls its protocol; identity revocation occurs only if acquired. No chooser is shown, owner/parent listeners remain absent at these early failure points, and later disposal does not repeat destruction/uninstall.

Removing setup cancellation fails6 tests; omitting acquired identity revocation fails9 (five new cases and four prior async startup cases). Restored11 startup cases pass. Composition1555802d (tree2c0e8b78294272d1091e752356033cf981479290) passes53 combined capture registration/startup/cleanup/permission/contract cases, Electron test types and targeted lint with own dependencies/pinned Node. Runtime is unchanged from1c301664, whose production build evidence retains that attribution. Logs in `wrap/cap003-permission-evidence/`: `setup-{baseline,restored,composed,types,lint}.log`, `setup-settlement-sensitivity.log` and `registration-release-sensitivity.log`. Commands are the existing four-file capture suite, tsconfig.mocha typecheck and explicit local ESLint config.

The setter/guard failures are injected; this demonstrates coordinator ownership response rather than actual Electron setter failure conditions. EventEmitter attachment with valid callbacks is not declared defective merely because an arbitrary mocked on method could throw. BrowserWindow allocation failure before flow creation, cleanup failure in that pre-flow path, partial native handler installation, native session lifetime and OS stream release still need platform evidence. Session protocol uninstallation removes the owned handler but does not itself establish session destruction. Existing retained permission callbacks deny ended flows as separately tested; that is not a memory-lifetime proof.

The next independent local source review is active renderer rejection diagnostics under the existing review/work-item register. Do not keep relabeling unexecuted native lifecycle work as passed local qualification.
