# Renderer account routing review — September 22

Reviewed active index/App/Sidebar/WebviewList/Webview/selector call paths and retained legacy action reachability at7a3b6e72. Source and tests are unchanged. This is a scoped renderer routing review, not native account or full diagnostic acceptance.

## Active routes

Renderer index waits for the main-owned store before mounting. Sidebar click/Enter emits a local selection event; index resolves the current snapshot's desktop account ID and calls wireAccounts.select. Selection is not committed optimistically through the old reducer. Out-of-range indices do not invoke the bridge. The shell's native IPC subsequently validates/authorizes the command. This custom DOM event is local UI plumbing, not a remote-account privilege boundary.

Sidebar add calls the named add method. Its native context-menu route uses the desktop ID, not webapp userID. Keyboard focus returns only after the native menu promise resolves and the original target remains connected; mouse opening does not steal focus. Main controller/native menu owns logout/removal actions. The selector determines display visibility, accent/theme, unfinished-account state and account-limit UI from snapshots; UI hiding is not the enforcement point for main's account limit.

WebviewList maps snapshots by stable account ID to status/chrome components. Despite the retained names, Webview renders no webview tag or remote document. Only the selected slot requests main layout, with bounded cancellation-header intent; the IPC/controller enforce actual dimensions. Retry-load, retry-removal and cancel-account call named methods with the owning desktop ID. Load-error UI displays a parsed origin and the fixed main load error; missing-endpoint mode renders its configuration screen. Actual page placement and Electron native view destruction remain native qualification, not DOM test evidence.

## Retained legacy code

App connects a legacy switchWebview prop, but App ignores that prop and does not invoke it. index still passes the actionRoot into thunk middleware, and reducer/action constants cause legacy modules to be bundled. Importing/binding functions does not establish a user action that calls them.

Repository-wide TS/TSX call/import search (excluding generated/test files) finds no production import of EditAccountMenu. That component contains legacy sendLogoutAccount/sendDeleteAccount calls, and AccountAction/startSSO/legacy action helpers retain renderer state/webview-oriented logic. They are not the active sidebar/native-menu lifecycle path. A NoUrlConfigured comment naming the old lookup is not a runtime call. This review does not remove those files or turn their test results into current native behavior proof.

The baseline-to-candidate AccountAction delta is the unread-reset call fromff40d2fa, covered by a direct legacy helper test using a DOM div and sendBadgeCount stub. Main-owned production selection now publishes badges through AccountController. Existing ELC-003 numeric mapping/Joi evidence for actions/index remains separately retained. Full legacy utility disposition and any later consumers still require explicit review; no generic dead-code purge is required by this finding.

## Provenance and validation

Production renderer cutover is inbb46ddea. Native-shell slot tests were added later inb7a9861d; index/sidebar tests were added inf6604dd5; failed-removal UI/test follows894df496. These are later characterization or same-change tests, not an invented separate pre-cutover baseline.

All11 existing index/sidebar/slot Jest cases pass. Mutating selection to the first account fails1, using webapp userID for native context menu fails3, wrong removal ID fails2 and allowing background layout fails1. All source files restore byte-for-byte;11 pass again. Tests emulate React/DOM and named bridges; index mocks root/store, Sidebar uses a Redux store, and slot tests use React with inert bridge methods. They do not execute native dialogs, session cleanup or actual desktop focus.

```sh
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath \
  electron/renderer/src/index.spec.tsx \
  electron/renderer/src/components/Sidebar/Sidebar.spec.tsx \
  electron/renderer/src/components/WebView/Webview.spec.tsx
```

Logs `/tmp/tst006-renderer-consumers-{tests,restored}.log` and `/tmp/tst006-renderer-{selected-account,menu-owner,removal-owner,background-layout}-sensitivity.log`. Existing82 renderer tests/types/lint/production build evidence remains attributed to7a3b6e72; those checks were not repeated during this source-only review.496 inventory paths remain exact. No runtime/test delta or native process occurred.

Remaining scope includes renderer/bridge rejection confidentiality: active catch(console.error) calls report raw rejected errors and are not accepted as general redaction. Main's changed callback revalidates display capture before pushing snapshots; DisplayCaptureCoordinator.end deletes its flow before native window destruction/cleanup calls that can throw. This source ordering identifies the next failure-ownership review, not a reproduced new defect or permission to bypass capture revalidation. Preserve actual native/Windows/profile/final platform/E2E/unsigned-package and documentation/publication gates.

September23 follow-up: [active renderer rejection confidentiality review](renderer-rejection-confidentiality-review.md) reproduces and corrects raw rejected Error logging for active shell account actions. Historical routing evidence above retains its original attribution; native and retained legacy paths remain open.
