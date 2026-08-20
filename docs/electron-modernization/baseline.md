---
document_id: WIRE-DESKTOP-ELECTRON-MODERNIZATION-BASELINE
status: captured
updated: 2026-08-20
work_items: [BASE-001, TST-001]
source_commit: 1b82b085ac1436a7f21d81cb944d2ee2f4ba4a4a
upstream_base: e1ba98c50dce28b26b05466169fbdf941f0285f3
---

# Legacy baseline

This records the unchanged legacy implementation before M0 test and evidence changes. A pass here establishes reproducibility; it does not approve insecure behavior.

## Environment

| Field               | Value                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Host                | Linux x86_64, WSL2 kernel `6.6.87.2`, graphical display `:0`                              |
| Node                | `22.22.1` host; Electron runtime reports Node `22.22.0` when forced into run-as-Node mode |
| Yarn                | `3.3.1` via `.yarn/releases/yarn-3.3.1.cjs`                                               |
| Electron            | `38.8.6`                                                                                  |
| Application version | `3.42.0` from the development version smoke                                               |

The IDE exports `ELECTRON_RUN_AS_NODE=1`. Electron commands must remove that inherited variable locally; CI does not set it. Chromium process startup also requires execution outside this workspace sandbox.

## Results

| Layer | Command | Result |
| --- | --- | --- |
| Application types | `yarn test:types` | pass |
| Development build | `yarn prestart` | pass; stale `caniuse-lite` warning |
| Test types | `yarn build:ts:tests` | pass |
| Jest/build/local renderer | `yarn test:react --runInBand` | 14 suites, 36 tests passed |
| Electron main | `yarn test:main` | 37 tests passed after removing inherited `ELECTRON_RUN_AS_NODE` |
| Electron renderer | `yarn test:renderer` | 2 tests passed after removing inherited `ELECTRON_RUN_AS_NODE` |
| Build tools | `yarn test:bin` | 13 tests passed |
| Development startup | `electron . --no-sandbox --version` | pass; prints `3.42.0` and exits |
| Aggregate coverage | legacy `yarn coverage` | fail: `.nyc_output` did not exist because test scripts were not run under NYC |
| Linux AppImage | `LINUX_TARGET=AppImage yarn build:linux` | fail during `registry-js` rebuild; wrapper logs the error but exits 0 |
| Development E2E | PR #3 run `32364188026` | Windows and macOS jobs passed; merged report: 57 expected, 3 unrelated flaky, 0 unexpected; group-call and logout cases passed first attempt on both platforms |
| Windows package smoke | PR #1 Windows runner | pass; development executable produced, launched, and retained |
| macOS package smoke | PR #1 macOS runner | pass; unsigned development app produced, launched, and retained |

## Baseline findings

| Finding | Consequence | Owning work |
| --- | --- | --- |
| `ELECTRON_RUN_AS_NODE=1` makes `electron-mocha` execute as Node and fail before tests | Local/agent runs need an explicit clean environment; packaged fuses already disable run-as-Node | BASE-001 |
| Electron startup is blocked by the execution sandbox even with the test `--no-sandbox` flag | Electron tests need an approved host/CI runner | BASE-001 |
| Legacy coverage command has no input data and covers neither unimported source nor local renderer code | Replace it with explicit NYC/Jest collection and CI artifacts | TST-001 |
| Linux packaging attempts to rebuild the Windows-only optional `registry-js` module | Linux artifacts cannot currently be reproduced in this environment | ELC-001, PKG-001 |
| Linux and macOS build functions catch packaging errors without rethrowing | CI can report success without an artifact; package existence must be asserted | ELC-001, PKG-001 |
| E2E runs only Windows and macOS; a local Linux attempt cannot currently substitute because the wrapper opens but Playwright does not expose its `<webview>` as the expected second window | Retain Windows/macOS as the development E2E gate and add representative Linux coverage under its owning work | TST-005 |
| The merged green report retained Windows localization and menu-archive flakes plus a macOS multi-account notification flake | These are visible non-blocking baseline instability, separate from the first-attempt group-call and logout results | TST-003, TST-005 |
| Current warnings include typeless ESM reparsing, stale Browserslist data, deprecated Node `punycode`, and AWS SDK v2 end of support | Compatibility inventory must track toolchain updates without conflating warnings with test failures | ELC-001, ELC-003 |

## Remaining platform evidence

The [PR #1 package baseline](https://github.com/adamlow-wire/wire-desktop/actions/runs/32187255739) retains Windows and macOS development artifacts and converts Linux's missing AppImage into a visible failure. [PR #3 E2E run 32364188026](https://github.com/adamlow-wire/wire-desktop/actions/runs/32364188026) passed both platform jobs after the authenticated-page and call-cleanup contracts were stabilized. All group-call and logout cases passed on their first attempts; the merged report retains the three unrelated flakes listed above. Repairing the known Linux package failure and making build wrappers propagate errors belong to PKG-001; representative Linux E2E belongs to TST-005.
