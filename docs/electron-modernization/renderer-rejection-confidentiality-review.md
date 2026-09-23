# CAP-001 active renderer rejection diagnostics — September23

The active application shell directly logged rejected values from named account actions and bootstrap. Even when main normally rejects with a fixed error, this renderer boundary has no contract that every rejection is safe to serialize. An Error containing a synthetic private marker reaches `console.error` unchanged. This is a confirmed INV-010 diagnostic boundary defect, not evidence of a real credential incident or proof of account-view log-file forwarding from the shell. The latter has a separate `contents` owner and needs its own review.

Separate baseline74590da5 adds four security targets over11 passing index/sidebar/account-slot controls; the four fail against original source. Scopedeb82163b uses fixed, action-specific messages for bootstrap, selection, add, context menu, layout, reload and both removal paths. Rejections still settle and actions do not gain authority. Existing tests that explicitly expected raw Error objects were updated because the plan/capability contract now requires confidential diagnostics. All86 renderer Jest cases in12 suites pass at composition5f2852cd (tree026d347d9d3484c0c3ed3befff8f9bdef2dd1c9e); root TypeScript, targeted lint and production TypeScript/webpack pass on the candidate's own immutable dependencies and pinned Node22.22.3. Replacing the layout label with a vague generic message fails its target, then exact source is restored. The initial Webview test expected three reports, but a real change to cancellation chrome triggers a second layout and fourth fixed report; its final assertion checks the precise four-message order and no rejected values.

Commands from `wrap/worktrees/recovery-tst006-composed`, with pinned Node first in PATH:

```sh
node node_modules/jest/bin/jest.js --runInBand
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/eslint/bin/eslint.js --no-eslintrc --config .eslintrc.json electron/renderer/src/index.tsx electron/renderer/src/index.spec.tsx electron/renderer/src/components/Sidebar/Sidebar.tsx electron/renderer/src/components/Sidebar/Sidebar.spec.tsx electron/renderer/src/components/WebView/Webview.tsx electron/renderer/src/components/WebView/Webview.spec.tsx
node node_modules/typescript/bin/tsc -P tsconfig.build.json
node node_modules/webpack-cli/bin/cli.js --env production
```

Local logs are `wrap/cap003-permission-evidence/renderer-diagnostic-{baseline,fixed,restored,full-final,focused-restored,types-restored,lint-restored,build,label-sensitivity}.log`; some intermediate logs intentionally retain a test typing error and the corrected Webview count. Do not present those as successful runs. Historical account routing and PR47/PR56 acceptance retain their original heads. Native shell startup, all-platform authenticated E2E, actual unsigned packages, final composition and independent review remain open. Full renderer/legacy action and account-view console diagnostic review remains separate TST-006 work.

The failed-removal retry has a separate d5a47d03 assertion for a rejected value containing a synthetic private marker. Reintroducing raw `.catch(console.error)` at that retry path fails1 of5 focused Webview cases; restored5 pass and root types pass. Composition2ba7ade3 (tree484448fee75fc5d311f3d73b9b35fff9f206d635) contains this test-only addition; runtime/build evidence stays at5f2852cd. Logs `wrap/cap003-permission-evidence/renderer-diagnostic-retry-{restored,sensitivity,composed,types}.log` and `renderer-diagnostic-final-2ba7ade3.log`. The complete renderer Jest suite was rerun on exact2ba7ade3 and passes86 cases in12 suites. The production source is unchanged from the compiled5f2852cd head.

## Active account preload rejection follow-up

`electron/src/preload/preload-account.ts` forwards webapp account events to the fixed account-event IPC channel. Its rejection handler previously passed the rejected `Error` object to `console.warn`, which can serialize data originating at this boundary. Inert baseline `f655d236` executes the actual transpiled preload module with a mocked IPC renderer: the successful-forwarding control passes, and a synthetic-private rejection fails the exact fixed-message assertion. No native webview or real credential was used. Scoped `3bfa7434` preserves the IPC event/channel and logs only `Account event rejected.`. Restoring raw Error logging temporarily fails the one confidentiality target while the forwarding control passes; the fixed source was restored before commit. The assertion includes both exact arguments and explicit rejected-object exclusion.

Focused two-case and adjacent 12-case inert Node suites pass. Root TypeScript, Electron test TypeScript, targeted lint, production TypeScript and webpack pass on the isolated worktree's immutable dependency symlink with pinned Node 22.22.3. Webpack retains its known bundle-size/Browserslist warnings. This is a source/test candidate, not native account-view or all-platform qualification. The shell renderer paths above and this preload path have different owners; the test does not prove where a console message is persisted by Electron. Other main/preload diagnostics remain under TST-006 review.

Reproduce from the scoped worktree:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/preload/preload-account.test.main.ts electron/src/preload/AccountShellBridge.test.main.ts electron/src/preload/WebappPreloadEvents.test.main.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.mocha.json --noEmit
node node_modules/typescript/bin/tsc -p tsconfig.build.json
node node_modules/eslint/bin/eslint.js --no-eslintrc --config .eslintrc.json electron/src/preload/preload-account.ts electron/src/preload/preload-account.test.main.ts
node node_modules/webpack/bin/webpack.js --env production
```
