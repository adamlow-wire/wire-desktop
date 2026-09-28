# CAP-001 account view teardown recovery — September 22

Separate baseline `d679ee73` adds six teardown targets to the11 passing setup tests. All six fail on existing behavior: permission disposal or native detach errors prevent native close; a throwing native close loses retry ownership/reservation; disposal cannot retry that lost allocation; the pre-registration setup path has the same ownership loss; simultaneous close callers do not consistently observe the cleanup failure.

The owner now reserves before invoking any cleanup callback. Revocation, detach and native close are attempted separately, preserving the first failure for callers while continuing cleanup. Failed cleanup stays in a private retry map, excluded from usable views and included in account/partition admission denial and owner disposal. A retry closes the same allocation, not a replacement. Even if destruction succeeded, earlier failed cleanup remains retryable/reserved until that cleanup succeeds. Concurrent callers share the complete operation and its rejection. Destruction listeners are removed on success or thrown close, avoiding accumulation on repeated failed attempts. No forced timeout, permission relaxation or new renderer authority is introduced.

Separate callback baseline `2db61aff`, run against the uncommitted teardown repair, passes17/fails3: crash cleanup rejection, a throwing lost callback and native window-close disposal rejection were not handled. Crash and window-close event adapters now catch rejections and report only `Account view lifecycle cleanup failed.`; reporter failure is contained too. Explicit close/dispose callers still receive failures and can retry. A crash cleanup failure does not claim successful reload.

All20 actual-class/real-registry inert cases pass. Fail-fast cleanup, omitted retry ownership, omitted disposal retry, suppressed crash reporting and suppressed window reporting perturbations fail3/6/2/2/1, respectively. Production source is restored byte-for-byte and20 pass. These tests use inert native/session/permission/load ports, so they do not prove native destruction, permission-session teardown or OS resource release.

The two-file overlay on composed5ad76db6 passes110 selected Node controller/profile/reader/cleanup/IPC cases, Electron and production types and targeted lint. Evidence `/tmp/cap001-view-teardown-{baseline,fixed,restored,types,production-types,lint,composed-tests}.log`, `/tmp/cap001-view-callback-baseline.log`, and `/tmp/cap001-view-teardown-{fail-fast,retry-owner,dispose-retry,crash-handler,window-handler}-sensitivity.log`.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/accounts/AccountViewsSetup.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/{AccountViews.ts,AccountViewsSetup.test.main.ts}
```

Actual native view/permission-session tests and retained Windows failures remain unqualified here. Hung native destruction remains reserved rather than being falsely declared closed; no forced native termination policy is added. Multiple simultaneous cleanup failures preserve the first error; downstream general diagnostics remain separately under review. Failed closures are bounded by allocated account owners, but full lifecycle/caller resource review remains open. Final platform/E2E/unsigned-package, profile/ciphertext choice and documentation reconciliation remain mandatory. No native process or remote write occurred.

## Composed build qualification

Exact source/test delta8d8fe8cd is composed as1a5363f3, tree7adc8c1d8de9d48ca7ce0e60b6a960298aa7e500. Production `tsc -p tsconfig.build.json` and `webpack --env production` complete successfully, with existing Browserslist/bundle-performance warnings; `/tmp/cap001-view-teardown-build.log`.495 inventory paths remain exact. The validation checkout is clean. This is a bundle build, not native startup or packaged-artifact qualification.
