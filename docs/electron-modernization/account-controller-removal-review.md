# Controller removal orchestration review — September 22

Reviewed production controller and main callback at `5112c50a`; runtime is unchanged from `00a88ae2`. This extends the queue and deletion reviews with controller-stage failure and retry evidence. It is not complete controller or native view acceptance.

## Effect and failure boundaries

`removeAccount` captures the target record and its current view session, or obtains the same account's session through the main-owned fallback if the view has already closed. It resets pending menu state, awaits view closure, awaits data/log cleanup, then calls AccountState.remove. Main's cleanup callback awaits browser-session cleanup before account-log deletion. AccountState persists before publishing the smaller account list. Failure in close, clearData or persistence retains the record, marks removalFailed and permits explicit retry; a successful earlier cleanup stage is not rolled back. On success, the controller clears its target failure flags, ensures/selects a surviving account and publishes its badge. Removing the last account creates a new empty account through the existing state contract.

The controller's finally callback publishes snapshots for admitted operations even when an effect fails. This is a separate effect: a throwing changed callback can replace the original rejection after state/data have already changed. Native session lookup is before the removal try block, and survivor creation/selection/badge publication is after it. These boundaries are not qualified by the four tests below. No atomic operation, rollback, exactly-once deletion, native destruction or forensic erasure claim follows from controller ordering.

AccountViews.close is the production owner of authority revocation, removal from the native content view and waiting for the destroyed event. The controller tests use an inert close port and cannot prove those effects. Source inspection identifies the next required review: entries are removed before revoke/removeChildView/contents.close complete, while creation also performs registration and guards before its cleanup try. Failure ownership at these boundaries needs dedicated reproduction and disposition; it is not resolved by retries at the controller layer. Native Windows failures remain open.

## Provenance and validation

Existing failure-state behavior originates in `894df496`; native log-cleanup coverage is in `b0a7bd8c`. This review inspected the native close-before-cookie-clear, storage-failure/retry and filesystem-failure/retry cases, but did not execute that fixture or accept its other cases. Those historical tests do not become a separate preimplementation baseline through this review.

Later test-only `374125ab` adds four cases using real AccountController and AccountState with owned inert views/sessions: paused close and cleanup must finish before persistence, and failures in close, cleanup and persistence must retain both records, publish the retry state and allow successful retry against the original target session. Assertions also retain the unrelated session and survivor selection. No Electron process or real browser storage is involved.

Temporary source perturbations removing the close await, cleanup await, moving persistence before cleanup, or suppressing removal failure state fail respectively1/2/4/3 cases. All mutations are restored byte-for-byte; all4 tests pass. Logs include failures induced by deliberately unawaited promises and are not evidence of a current unhandled rejection. Electron test types were rerun after full source restoration and pass; targeted lint passes.

The exact test is composed as `5112c50a` (tree `24e077807bc9eeaaa24fe6b58bf41a45b1b1287c`).90 selected Node controller/queue/profile/state/cleanup/reader/IPC cases pass. Production and dependencies are unchanged; earlier build and other-suite results retain their original heads. This is still a temporary validation composition, not a final merge candidate.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/accounts/{AccountControllerRemoval,AccountControllerQueue,AccountProfile,AccountState,AccountSessionCleanupOrder,readLegacyAccountStateLifecycle}.test.main.ts \
  electron/src/security/{AccountDataDeletionIpc,AuthorizedIpc,ProxyPromptIpc}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountControllerRemoval.test.main.ts
```

Evidence: `/tmp/tst006-controller-removal-{tests,restored,composed-tests,types,lint}.log` and `/tmp/tst006-controller-removal-{close-await,clear-await,persist-early,failure-state}-sensitivity.log`. Native view/session failure ownership, whole-controller caller and reporting review, profile/ciphertext compatibility and final platform/E2E/unsigned-package qualification remain mandatory.
