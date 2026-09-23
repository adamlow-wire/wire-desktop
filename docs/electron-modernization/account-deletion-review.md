# Account deletion route and cleanup review — September 22

Reviewed source at6e987dc5. This separates retired IPC/helper behavior from active native account removal; it is not data-erasure or Windows cleanup acceptance.

## Production reachability

AccountDataDeletionContract/Ipc still define a fixed shell-only delete-data channel. Its validator requires UUIDv4 account/optional partition, a positive safe-integer web-contents ID and exact keys. The binder checks shell authority and quota20/minute, then the registered account target's ID/account/partition/live-session/frame/origin before invoking deletion. Six existing Node tests pass for invocation, explicit/default partition, mismatches, malformed requests and quota. These source/tests originate ind4984b73, with later default-target coverageb66c45e2; no separate original baseline is claimed here.

Production search finds no binder invocation or capability grant in mainProcess, accounts or secureShell. The legacy preload-app adapter retains an import, but the production IPC inventory and DCP-004 ledger explicitly record route/capability retirement in PR47. The retained LocalAccountDeletion implementation is therefore not the active deletion path. Its best-effort raw diagnostics and old filesystem/session semantics cannot be used to infer active behavior; no legacy cleanup is removed or silently reactivated by this review. Full legacy helper disposition remains separate.

## Active removal

AccountController.removeAccount captures the selected record/session, closes the owned view, awaits main's clearData callback and removes the profile record only after that succeeds. Main's callback awaits clearAccountSession before native account-log deletion. Failures set removalFailed and retain the record for explicit retry; successful removal then selects/ensures another account view. Browser clearing is not transactional: earlier stages can have succeeded when a later stage fails. This review does not claim rollback or forensic erasure.

clearAccountSession awaits exactly target.clearData(), target.clearAuthCache(), target.closeAllConnections(), in that order. The current source and native tests originate together ine6ffe767; native timeout-budget follow-up7d15a032 is historical, not proof that retained Windows failures are resolved. Native tests exercise cookies, authentication and broader browser storage isolation with real windows/network; none are run here.

Later test-only98353af7 adds four inert-session cases: every stage remains awaited through final resolution, each failure retains exact error identity and stops later stages, and the same session can retry successfully. Combined with six retired IPC cases,10 Node tests pass. Removing each individual await fails2; swallowing clearData failure fails1. Source restores byte-for-byte and all4 new cases pass again. Lint and a test-only Electron-type overlay on6e987dc5 pass; overlay removed. This proves orchestration, not that Chromium actually clears data or releases Windows resources.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/accounts/AccountSessionCleanupOrder.test.main.ts \
  electron/src/security/AccountDataDeletionIpc.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountSessionCleanupOrder.test.main.ts
```

Logs `/tmp/tst006-account-cleanup-order-{tests,restored,types,lint}.log` and `/tmp/tst006-account-cleanup-{data-await,auth-await,connections-await,failure}-sensitivity.log`. Only the compiler/lint use the temporary composed overlay; the direct tests use byte-identical production modules in the audit checkout. No native process or remote action occurred.

Frozen inventory remains6e987dc5/491 paths; the later new test must be reconciled. Remaining work includes full controller/profile/log-deletion composition review, native session/data isolation and retained Windows lifecycle failures, final real-package/restart evidence and the pending profile compatibility decision. Earlier PR47/59 native evidence remains attributed to its original heads.

## Reconciled cleanup characterization

Current5eef88e6 includes98353af7 exactly. All4 new cleanup cases are included in108 passing Node logging/cleanup/retired IPC checks; Electron test types and targeted lint pass. Inventory492 exact paths. The earlier pending-reconciliation note is historical. Production is unchanged; native storage/authentication isolation, Windows failures and controller/profile compatibility qualification remain open.
