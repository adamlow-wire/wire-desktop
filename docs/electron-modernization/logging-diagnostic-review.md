# Logging lifecycle and diagnostic boundaries — September 22

Scope: source review at detached65e258ab. This does not establish secret-free logs or close INV-010. No production change was made; raw artifacts or real credentials were not used.

## Error ownership

| Boundary | Observed behavior | Disposition |
| --- | --- | --- |
| `fireAndForgetInvoker` | Invokes the callback synchronously, tracks its promise, forwards original synchronous/rejected errors to its injected reporter, and removes settled work in finally. An observer-reporting failure is sent to the reporter again. | An orchestration helper, not a redactor. `waitUntilAllSettled` is a snapshot of current work. The reporter must be reliable; repeated reporter failure can still escape and is not covered by the one-failure recovery test. |
| Main-process background reporter | `mainProcess.ts` passes the original error to the file logger. Callers include account lifecycle, desktop actions and link dispatch. | Security-sensitive caller errors require a payload-flow review; a fixed prefix alone does not establish non-secret output. No new exploit or credential disclosure is claimed from this source observation. |
| Desktop writer background reporter | Passes original errors to console with a fixed prefix. | Filesystem paths/error objects remain visible. Does not recursively route the failure through the file transport. Confidentiality needs caller-specific disposition. |
| Initial/periodic cleanup | Startup forwards the cleanup error to its reporter and then schedules; main's reporter passes the error to the logger. Periodic work uses the main background reporter. | Cleanup failures are best effort; ordering/recovery is tested separately from diagnostic contents. |
| Log snapshot/export | Helpers report copy/removal failures with paths and original errors; loggerUtils forwards them and catches terminal export failure. | User-selected destinations and source paths may appear. Existing streaming/staging tests do not prove a redaction policy. Keep the diagnostic review open. |
| Account console forwarding | Enabled by `ENABLE_LOGGING`; production defaults off, development or explicit `--enable-logging` enables it. Bounds text before formatting and removes the literal `access_token=` query form. | It is not a general secret sanitizer. The ordinary remote-console feature is not silently removed or relabelled non-secret. Review sensitive-message policy at this boundary before any broader confidentiality claim. |
| SSO and external-open candidate | Current SSO diagnostic catches and WindowUtil.openExternal use fixed operation messages without original errors. | These already-reviewed scoped fixes do not imply every other logger call is safe. WindowUtil.sendEvent retains raw error logging as separate scope. |

INV-010 concerns security-sensitive failures. The existence of a raw local filesystem error is not, by itself, proof of a credential exploit; conversely, passing tests or truncating a message is not proof of confidentiality. The next executable diagnostic task is to trace actual security-sensitive values through the main background reporter's account/action/link callers and establish a concrete regression before any scoped runtime fix. Preserve logging capability decisions explicitly if behavior must change.

## Lifecycle source and test review

`initializeDesktopLogLifecycle` awaits initial cleanup, reports its rejection and schedules periodic cleanup afterward. Reporting itself must not throw if scheduling is to continue. Source/test history is9244eff4 with30c1c2e2; no separate preimplementation baseline is established here.

`scheduleLogCleanup` passes the configured interval to setInterval, invokes cleanup through the injected observer and unrefs the timer. It has process-lifetime ownership and no cancellation API. The production interval constant is one hour; the helper test passes60000ms to prove argument forwarding despite its historic hourly title. Source/test origin isd0510140, with subsequent test history disclosed rather than inferred as pre-refactor evidence.

`fireAndForgetInvoker` source/test originate together in1781c337. Its tests cover synchronous invocation, synchronous/asynchronous rejection identity, one reporter failure and waiting for active actions. They do not prove future-operation draining or recovery from repeatedly throwing reporters. Keeping async callback invocation synchronous matters to the logging maintenance admission counter.

All8 cases pass at65e258ab. Temporary omission of startup awaiting fails2 ordering/recovery assertions, omission of unref fails1, and omission of failure forwarding fails3. Source is restored byte-for-byte and all8 pass again; the checkout is clean. No native process, timer wait or remote operation was used.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/logging/{logStartup,logCleanupScheduler}.test.main.ts \
  electron/src/lib/fireAndForgetInvoker.test.main.ts
```

Evidence `/tmp/tst006-log-lifecycle-{review,restored}.log`, `/tmp/tst006-log-lifecycle-{startup,schedule,report}-sensitivity.log`; exact mutation driver `/tmp/tst006-log-lifecycle-sensitivity.py`. No coverage percentage or all-platform acceptance is claimed. Six inventory rows now record source/provenance/coverage dispositions with these limits; pending cells remain343 source/373 provenance/383 coverage, and populated partial rows remain unfinished.

## Account-startup failure boundary — dfb19f0a

Tracing `AccountViews.create` → `loadAccountDestination` → controller ensure/reload shows native loadURL failures are already replaced before reaching the generic background reporter. The loader creates a fresh Error with a fixed message and, only when syntactically allowed and bounded, an ERR_ code. It drops the native URL/message, arbitrary properties and cause. Therefore the generic reporter's raw-error call is not evidence that this particular startup URL escapes. Other configure/session/action failures and CoreProtocol's catch remain separate review scope.

Source history:81052251 introduces authorized redirect completion and tests; separate confidentiality baseline668987ed precedes fix5c596187. The existing tests cover replacement completion both before/after native rejection, foreign/subframe/same-document denial, crash/destruction/lost-owner cancellation, main-document failure and listener/timer cleanup. The30-second budget applies to a superseding redirect continuation after native ERR_ABORTED, not every possible initial native load stall; it does not diagnose the retained Windows lifecycle timeout.

Later test-onlydfb19f0a adds five cases: allowed native code remains useful; a code containing a URL and an oversized code are omitted; primitive and null rejections become fixed failures. Exact messages, fresh Error identity, empty enumerable properties, absent cause, clean stack and removed listeners are asserted. All20 cases pass. Temporarily rethrowing the original failure yields11 failing tests; bypassing the code format/length filter yields2. Both perturbations are restored; all20 pass again. This is characterization of the existing fix, not a new runtime remediation.

The tested production module is byte-identical to composed65e258ab. Scoped lint and Electron test types with the new test temporarily overlaid on that composed checkout pass; the overlay is restored and the composed checkout is clean. No real URL load or native Electron process occurs: the fixture uses an inert EventEmitter and fake timers. Evidence `/tmp/tst006-navigation-diagnostics-{tests,restored,types,lint,raw-sensitivity,code-sensitivity}.log`, exact perturbation driver `/tmp/tst006-navigation-diagnostics-check.py`.

The frozen inventory remains65e258ab; its two navigation entries now identify source/provenance and this later test delta. Exact pending cells342 source/371 provenance/381 coverage remain, with other populated gaps. The new test must still be composed and qualified with the final candidate. Next: review CoreProtocol/WindowManager dispatch and remaining configure/background errors without generalizing the protected native-load path to those callers.

## Subsequent composed evidence

Later navigation testsdfb19f0a and SEC-013 dispatch candidatea2d77b19 are now combined in308fceb4. All29 dispatch/navigation cases, all types, aggregate code lint and production build pass. [Candidate reconciliation](candidate-reconciliation.md#dispatch-diagnostic-recomposition--308fceb4) records the current scope and486-path inventory. CoreProtocol now uses a fixed failure message; the earlier raw-error observation describes its pre-fix source. Generic/configure reporters and final native/platform gates remain open.
