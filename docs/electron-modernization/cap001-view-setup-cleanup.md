# CAP-001 account view setup cleanup — September 22

TST-006 review reproduced four setup failures after native allocation that bypassed AccountViews.create cleanup: initial setVisible, identity registration, navigation guard and popup guard. Separate baseline `d8b066a6` passes5 control cases/fails4 destruction assertions. No remote navigation starts in these early failures, but a native allocation can remain alive; guard failures also leave a registered entry.

All setup after allocation now falls inside the existing cleanup try. Registered entries use the existing close owner; failures before an entry exists close their exact allocated contents and await its destroyed event. A closing reservation protects the account ID and normalized partition during that wait. Existing preference/session/origin/permission policy is preserved.

Additional baseline `164761dc` records two delayed-destruction cases. Against the initial uncommitted try-boundary correction,10 cases pass and the pre-registration reservation case fails: another account could claim the same session before destruction. The final reservation prevents both same-account and different-account/same-partition replacement, then permits retry once destruction completes.

All11 cases pass with the actual AccountViews class extracted and compiled from production source, real ViewIdentityRegistry/registerViewIdentity and inert native/session/permission/load ports. The fixture checks sandbox/context isolation, disabled Node/worker Node/webview, cleanup after eight setup failures, authority revocation, retry and delayed-destruction reservation. These are orchestration checks, not native execution. Temporary restoration of the old setup fails6; omitting unregistered cleanup fails3; omitting its reservation fails1. Source restores byte-for-byte and11 pass.

A two-file overlay onto composed5112c50a passes101 selected Node controller/profile/reader/cleanup/IPC cases, Electron test types, production types (`tsconfig.build.json`) and targeted lint. An initial production-type command used a nonexistent electron/tsconfig.json; it did not validate anything and was corrected. One test template-format lint error was fixed without changing assertions. Logs `/tmp/cap001-view-setup-{baseline,reservation-baseline,fixed,restored,types,production-types,final-lint,composed-tests}.log` and `/tmp/cap001-view-setup-{old-setup,no-unregistered-cleanup,no-reservation}-sensitivity.log`.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/accounts/AccountViewsSetup.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/{AccountViews.ts,AccountViewsSetup.test.main.ts}
```

This closes the reproduced setup ownership paths locally, not CAP-001 or the handoff. Native constructor/event/session behavior and final platform checks remain required. Teardown that itself throws (revocation, detach or native close) still requires direct failure/retry review; current finally cleanup does not prove a live native resource cannot be orphaned on those failures. Crash callback rejection handling, asynchronous permission teardown, full controller review, Windows failures and final documentation reconciliation remain open. No native process, user profile mutation or remote write occurred.
