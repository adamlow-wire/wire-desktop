# CAP-001 account display bootstrap race — September 22

Separate baseline4135f7a6 reproduces a lost main snapshot using real createAccountShellBridge and configureStore in Jest/jsdom. Resolve the initial read, then deliver a newer push in the microtask before store initialization resumes: the bridge correctly caches the newer state, but the old store subscribes too late and displays the old name/badge. The baseline passes2 controls/fails1 exact snapshot assertion. Initial execution in the old scoped tree could not load deprecated Joi; the meaningful baseline runs as a test-only overlay on1d7c2a52 with identical store/bridge source and composed dependencies.

Store startup now subscribes before awaiting the read and retains the latest pushed snapshot until Redux is created. Subsequent pushes dispatch normally. A failed read still rejects even if a push already arrived; it does not create a fallback store and now unsubscribes its startup listener. Existing failed-bootstrap test changes from expecting no subscription to requiring one subscription and exactly one cleanup, preserving the original rejection/no-persistence contract. Another test explicitly checks failure after a buffered push. The bridge's ordinary subscribe/event behavior is unchanged.

All4 store cases pass. Ignoring the latest buffer fails1; omitting failed-startup unsubscribe fails2; omitting live update delivery fails2; accepting failed reads fails2. Source restores byte-for-byte and4 pass. Full composed renderer Jest suite passes82 cases/12 suites, and4 unchanged preload bridge Node cases pass. Root/Electron test types pass. Import-order lint failures were corrected without assertion changes; targeted lint then passes.

```sh
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath electron/renderer/src/configureStore.spec.ts
node node_modules/jest/bin/jest.js --runInBand
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/preload/AccountShellBridge.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/renderer/src/configureStore.ts electron/renderer/src/configureStore.spec.ts
```

Evidence `/tmp/cap001-store-bootstrap-{baseline,fixed,restored}.log`, `/tmp/cap001-store-{react,bridge-tests,types,test-types,lint-fixed}.log` and `/tmp/cap001-store-{newest-buffer,failed-unsubscribe,live-update,failed-read}-sensitivity.log`. These are DOM/emulated-preload checks, not native Electron startup or actual contextBridge serialization. Successful store subscriptions retain the existing window-lifetime ownership; repeated initialization/hot reload is not newly supported. Final native/platform/E2E/unsigned-package and profile gates remain open. No native process or remote write occurred.

Composed7a3b6e72 includes exact59ae067b source/tests. Production TypeScript emission and webpack production bundle pass (`/tmp/cap001-store-build.log`), with existing Browserslist/performance warnings. Validation checkout clean;496 inventory paths match. This is compilation/bundle evidence, not native startup or package acceptance.
