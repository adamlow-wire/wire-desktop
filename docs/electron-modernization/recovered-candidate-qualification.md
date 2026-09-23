# Recovered composed candidate qualification — September23

Candidate `0a9617912f141d9853a3347bb65c78cc66227947`, tree `3f3d66d5948b8b0aa2698eaebe15533b50d11376`, has its own dependency installation in `wrap/worktrees/recovery-tst006-composed`. It no longer borrows the older root checkout's modules. Tracked sources and lockfile remain unchanged after validation. This remains a temporary validation composition requiring final documentation reconciliation before integration.

## Reproducible environment

- Pinned Node22.22.3, Yarn3.3.1. Initial restoration used host Node22.22.1; immutable installation was repeated successfully under22.22.3 before the checks below.
- Official Linux x64 Node archive SHA-256: `2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f`, checked against `https://nodejs.org/dist/v22.22.3/SHASUMS256.txt` before extraction. Local tools: `wrap/recovery-tools/node-22.22.3/node-v22.22.3-linux-x64/bin`.
- `yarn.lock` SHA-256: `fdedd621a91e7027abffca9ae3f5ce258034189033fff5f449ae53d0ec0730e3`.
- Configured public assets: `wireapp/wire-web-config-wire#v0.34.6`; normal install postinstall generates required images/plist/defaults.
- Electron npm package remains43.4.0. Its native binary is not installed by this restoration; no Electron process was launched. This installation is not a packaged-runtime or native-execution qualification.

## Results

| Check                                        | Result                                               |
| -------------------------------------------- | ---------------------------------------------------- |
| Immutable install under pinned Node          | pass; existing peer warnings retained                |
| Root/application types                       | pass                                                 |
| Build-tool types                             | pass                                                 |
| Playwright types                             | pass; no browser/E2E execution                       |
| Electron test types                          | pass; no native execution                            |
| Renderer Jest/jsdom                          | 82 cases,12 suites pass                              |
| Full Node build-tool suite                   | 376 pass, approximately4 minutes                     |
| Capture cleanup/permission/startup/contracts | 40 inert Node cases pass                             |
| Changed capture source/test lint             | pass with explicit candidate configuration           |
| Production TypeScript and webpack            | pass; existing bundle/Browserslist warnings retained |

The initial ordinary lint invocation failed because this nested checkout inherited the older outer checkout's ESLint plugins, producing duplicate jasmine plugin resolution. Running the unchanged candidate configuration explicitly with `--no-eslintrc --config .eslintrc.json` passes. No rule or assertion was disabled. Earlier standalone-test/borrowed-tool results retain their original scope.

Commands from the recovered composed checkout, with pinned Node at the front of PATH:

```sh
YARN_ENABLE_GLOBAL_CACHE=true node .yarn/releases/yarn-3.3.1.cjs install --immutable
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.bin.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.playwright.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/jest/bin/jest.js --runInBand
node node_modules/mocha/bin/mocha.js --require .babel-register.js 'bin/**/*.test?(.main).ts'
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/calling/display/DisplayCaptureStartup.test.main.ts electron/src/calling/display/DisplayCaptureCleanup.test.main.ts electron/src/calling/display/DisplayCaptureContract.test.main.ts
node node_modules/eslint/bin/eslint.js --no-eslintrc --config .eslintrc.json electron/src/calling/display/DisplayCaptureCoordinator.ts electron/src/calling/display/DisplayCaptureStartup.test.main.ts electron/src/calling/display/DisplayCaptureCleanup.test.main.ts
node node_modules/typescript/bin/tsc -P tsconfig.build.json
node node_modules/webpack-cli/bin/cli.js --env production
```

Local logs: root `wrap/cap003-permission-evidence/recovered-{immutable-install,pinned-install,types-root,types-bin,types-playwright,types-electron-tests,renderer,tooling,capture,capture-lint,capture-lint-isolated,build}.log`. Do not commit generated reports. Do not run `build:prepare` or `clear:wrap`: recovery worktrees and the protected MSI checkout live under wrap. Protected MSI head remains255bdd54.

## Remote and remaining gates

Read-only refresh September23 at09:56BST: [PR62](https://github.com/adamlow-wire/wire-desktop/pull/62) is open at unchangeda1cb2b84, base897e3930. Latest [Windows package baseline](https://github.com/adamlow-wire/wire-desktop/actions/runs/35036531801/job/104606783584) fails; the earlier Windows baseline35035967586 passed and must not hide the later failure. [Linux E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/35035967615/job/104605123525) fails; Windows/macOS E2E in the same run are cancelled. Report publication success does not establish E2E success. These checks are for the old PR head, not this local composition. No remote write or rerun occurred.

Local qualification does not close source/provenance/coverage review, native Windows failure diagnosis, profile/ciphertext compatibility, final all-platform authenticated E2E, actual unsigned installers/artifacts/hashes/shipped-dependency audit, publication approval, or final documentation union and missing-patch recovery. Next executable source review is partial synchronous capture setup/constructor rollback/session lifetime; retain the other existing scoped items and final qualification gates. Signed release qualifications remain downstream as agreed.
