---
document_id: WIRE-DESKTOP-ELECTRON-COMPATIBILITY-INVENTORY
status: complete-for-38-to-43
updated: 2026-08-18
work_items: [ELC-001]
current_electron: 38.8.6
target_reviewed: 43.4.0
---

# Electron compatibility inventory

## Version window

Electron `38.8.6` reached end of life on 2026-03-10. On 2026-08-18 the latest stable line is Electron 43; Electron's schedule maps 39 to Chromium 142/Node 22.20, 40 to Chromium 144/Node 24.11, 41 to Chromium 146/Node 24.14, 42 to Chromium 148/Node 24.15, and 43 to Chromium 150/Node 24.17. The upgrade therefore crosses both a Node major and ten Chromium majors. See the official [release schedule](https://releases.electronjs.org/schedule) and [breaking-change register](https://www.electronjs.org/docs/latest/breaking-changes).

This inventory is valid for 38 through 43. ELC-002 must refresh it if a newer stable major exists when upgrade work starts or reaches release-candidate cut.

## Breaking changes 39 through 43

| Major | Upstream change | Repository classification | Resolution/evidence path |
| --- | --- | --- | --- |
| 39 | `--host-rules` deprecated | not applicable; no repository use | Keep proxy tests; do not add the deprecated switch |
| 39 | `window.open` popups always resizable | applicable | SSO/PiP and external-window handlers already override/deny creation; characterize under TST-002/CAP-003 and recheck per-major |
| 39 | macOS desktop audio capture requires `NSAudioCaptureUsageDescription` on macOS 14.2+ | blocker | `desktopCapturer` is exposed but `resources/macos/Info.plist.json` lacks the key; CAP-003/PKG-001 must add the reviewed purpose string and packaged screen/audio test |
| 39 | Shared-texture offscreen paint payload changed | not applicable | No offscreen/shared-texture rendering; `offscreen` is explicitly false |
| 40 | Renderer-process `clipboard` API deprecated | applicable/security-aligned | `preload-context.ts` imports clipboard; move clipboard operations behind the narrow bridge under SEC-005/CAP-004 before Electron 44 removes renderer access |
| 40 | macOS dSYM archives use `tar.xz` rather than zip | requires release-tool verification | No Electron dSYM consumer found in repository; Release Engineering must verify external symbol upload under PKG-001 |
| 41 | PDF resources no longer create a separate `WebContents` | low applicability | No PDF-specific handler found; navigation/view identity tests must confirm PDF frames cannot gain capabilities under SEC-002/SEC-008 |
| 41 | Cookie `changed` causes gain overwrite-specific values | not applicable in current source | No cookie-change listener found; SSO uses get/set/flush only |
| 41/43 | Linux `showHiddenFiles` deprecated then removed | not applicable | No use found |
| 42 | macOS notifications move to `UNNotification` and require signing | applicable | Notification E2E currently mocks browser notifications; CAP-004/PKG-001 require signed packaged notification delivery/failure checks |
| 42 | Offscreen rendering defaults to scale factor 1.0 | not applicable | Offscreen rendering disabled |
| 42 | Electron binary download moves from package `postinstall` to first execution | applicable build change | Verify immutable Yarn install, mirrors, offline/reproducible CI cache, and cross-platform acquisition at the 41-to-42 step |
| 42 | `Session.clearStorageData({quotas})` removed | not applicable | Calls pass no `quotas` object |
| 42 | Array-only `hslShift` argument deprecated | not applicable | No use found |
| 43 | Rounded corners and native WCO layout on Linux | low applicability | Current windows use native/default title bars; packaged UI smoke under PKG-001 guards shell/PiP behavior |
| 43 | `NativeImage.toBitmap()` normalizes to sRGB | not applicable | No `toBitmap`/`getBitmap` use found |
| 43 | Extension CSS injection includes more fallback frames | not applicable | No Chrome extension scripting use found |
| 43 | Dialogs without `defaultPath` start in Downloads | applicable behavior | Current save paths are explicit; audit any new open/save dialogs under capability tests |

## Adjacent deprecated/security-sensitive Electron APIs

These are not new 39-to-43 removals, but they are upgrade blockers because carrying them forward would preserve the unsafe boundary or accumulate near-term removal risk.

| Area | Current evidence | Resolution owner/path |
| --- | --- | --- |
| DOM `<webview>` | Main window enables `webviewTag`; React renders account `<webview allowpopups>` | SEC-007 and ADR 0001 replace with main-owned `WebContentsView` |
| `@electron/remote` | Initialized/enabled for main and guest contents; required by remote/menu preloads and shared modules | SEC-004 removes rather than upgrades it |
| Sandboxing/context isolation | Main/account views explicitly set both false | SEC-005/SEC-006; no compatibility flag may preserve this in target architecture |
| Callback protocol APIs | SSO uses deprecated `isProtocolRegistered`, `registerStringProtocol`, and `unregisterProtocol` | CAP-002 migrates to `protocol.handle`/`unhandle` with one-time response policy |
| Legacy `console-message` arguments | Main and SSO listeners consume positional level/message arguments deprecated since Electron 35 | ELC-002 updates to the details object when required and retains secret-redaction tests |
| Broad privileged IPC | Main handlers for safe storage, display capture, Open Graph, deletion, relaunch, and settings do not consistently authorize sender/payload | SEC-002/SEC-003 before capability migration |

## Toolchain and packaging blockers

| Component | Current | Classification | Owner and resolution |
| --- | --- | --- | --- |
| Host Node | `.node-version` `22.22.3` | Node 24 is embedded from Electron 40 onward; build Node may remain 22 only if supported by all tools | ELC-002 tests runtime behavior at each major; ELC-003 aligns build Node deliberately |
| `electron-mocha` | `12.3.1` | Must prove main/renderer tests and source-map coverage on each Electron major | ELC-003/TST-001; replace if it blocks sandboxed integration tests |
| Playwright | `1.60.0` | Electron launch compatibility and Chromium browser-shell install must be tested | ELC-003/TST-005 |
| `electron-builder` | `25.1.8` | Linux package currently fails rebuilding Windows-only `registry-js`; error is swallowed | ELC-003/PKG-001; fix dependency pruning and propagate failure before accepting artifacts |
| `electron-packager` | `17.1.2` | Windows/macOS packaging and Electron 43 download/sign behavior unverified | ELC-003/PKG-001 |
| `@electron/fuses` | `1.8.0` | Existing useful fuses must remain compatible and be re-read from packaged binaries | SEC-011/PKG-001 |
| `@electron/osx-sign` | `1.3.3` | Signing/notarization and Electron 42 notification behavior require signed artifact tests | ELC-003/PKG-001 |
| `electron-updater` | `6.8.3` | macOS update metadata and rollback compatibility need released-version fixtures | ELC-003/PKG-002 |
| `electron-winstaller` | `4.0.2` | Squirrel build/update behavior and MSI coexistence are Windows-only gates | ELC-003/PKG-002 |
| `registry-js` | `1.16.1` optional dependency | Rebuild fails on the captured Linux environment | ELC-003/PKG-001 |
| Windows ia32 scripts | Explicit x86 build/install scripts remain | Electron 43 supports them, but Electron 44 removes Windows ia32 binaries | Product/Platform must resolve Q-001 before a target of 44+ |
| Chromium/webapp | Chromium 140 to 150 | Remote Wire webapp compatibility cannot be inferred from wrapper unit tests | ELC-002 plus Windows/macOS/Linux E2E at each accepted upgrade step |

## Upgrade execution rule

ELC-002 advances 38→39→40→41→42→43 one major per reviewed commit. At each step it runs types, development build, Jest, Electron main/renderer, build-tool tests, coverage, available E2E, and platform package smoke. A step is not accepted when a packaging function merely logs an error or when its claimed artifact is absent. The target is refreshed before the first step and at release-candidate cut; new majors extend this inventory before version changes land.
