# Desktop capability and confidence matrix

## Rules

- This matrix tracks behavioral confidence, not implementation progress alone.
- `current confidence` describes the verified legacy baseline.
- `target evidence` describes what must exist before migration is accepted.
- Update a row when tests, platform support, product scope, or confidence changes.
- Detailed work remains in `plan.md`; do not create competing task lists here.

Confidence values are `none`, `low`, `medium`, or `high`. `High` requires representative automated behavior and packaged/platform evidence where applicable.

| Capability ID | Capability | Platforms | Current evidence | Current confidence | Characterization owner/work | Migration work | Target evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DCP-001 | Normal login and registration | Windows, macOS, Linux | Playwright critical flows on Windows/macOS | medium | BASE-002 | CAP-001 | Development E2E plus packaged login smoke on supported platforms |
| DCP-002 | Multi-account add/switch/remove | Windows, macOS, Linux | Critical and regression E2E; reducer/action tests | medium | BASE-002, TST-004 | CAP-001 | E2E plus partition, IPC, and storage isolation tests |
| DCP-003 | Enterprise and automated SSO | Windows, macOS, Linux | Secret-length unit test and deep-link forwarding test | low | TST-002 | CAP-002 | Controlled IdP E2E, protocol abuse tests, cookie/account isolation, cleanup |
| DCP-004 | Logout, data clearing, and persistence | Windows, macOS, Linux | Logout and account-removal E2E | medium | BASE-002 | CAP-001, PKG-003 | Per-account deletion tests and released-version migration fixtures |
| DCP-005 | Tray and native application menu | Windows, macOS, Linux | Basic tray icon/unread/flashing tests; menu E2E | low | TST-003 | CAP-004 | Platform branch tests plus packaged native smoke |
| DCP-006 | Notifications, badges, and activation routing | Windows, macOS, Linux | Notification E2E with mocked notifications and badge checks | medium | TST-003 | CAP-004 | Correct account/conversation routing and packaged platform smoke |
| DCP-007 | Camera and microphone calling | Windows, macOS, Linux | Call E2E using fake media devices | medium | BASE-002, TST-004 | CAP-003 | Allow/deny permission tests and packaged call smoke |
| DCP-008 | Display capture and screen sharing | Windows, macOS, Linux | No direct desktop boundary tests | none | TST-004 | CAP-003 | User-gesture authorization, source selection, deny cases, packaged smoke |
| DCP-009 | Picture-in-picture call windows | Windows, macOS, Linux | No direct tests | none | BASE-002, TST-004 | CAP-003 | Fixed preferences, navigation policy, lifecycle and interaction tests |
| DCP-010 | Deep links and single-instance routing | Windows, macOS, Linux | Four happy-path dispatch tests | low | TST-004 | CAP-006, SEC-013 | Valid lifecycle routing plus malformed, oversized, recursive, and hostile input |
| DCP-011 | Proxy configuration and authentication | Windows, macOS, Linux | Proxy parsing/generation unit tests | low | BASE-002 | CAP-005 | Session-targeted auth, cancellation, credential handling, packaged enterprise smoke |
| DCP-012 | Certificate verification and interception handling | Windows, macOS, Linux | No direct tests | none | BASE-002, TST-004 | CAP-005 | Pin/Chromium failure, approved exception, retry, save, and fail-closed tests |
| DCP-013 | Managed configuration | Windows, macOS, Linux | Central managed-config tests; platform backends untested | low | BASE-002 | CAP-005 | Backend fixtures and immutable authorized bridge tests |
| DCP-014 | External links and context menus | Windows, macOS, Linux | Protocol filtering implementation; limited direct coverage | low | TST-004 | SEC-004, SEC-008, SEC-013 | Allowed/denied protocol tests and packaged OS-browser smoke |
| DCP-015 | Open Graph retrieval | Main process | Size/content tests; sender/network policy gaps | low | TST-004 | SEC-012 | SSRF, redirect, protocol, credential, timeout, and size tests |
| DCP-016 | Safe storage bridge | Windows, macOS, Linux | No sender authorization tests | none | TST-004 | SEC-002, SEC-003 | Authorized account contract and hostile/cross-account deny tests |
| DCP-017 | Squirrel install and updates | Windows | Two installation-type detection tests | low | BASE-002 | PKG-001, PKG-002 | Signed fresh install/update/rollback and legacy migration |
| DCP-018 | MSI managed deployment | Windows | Build-tool tests and release acceptance checklist exist on the pending `feature/WPB-5221-windows-native-msi` branch | low | BASE-002 | PKG-001, PKG-002 | Merged baseline plus signed install/upgrade/repair/uninstall and Squirrel coexistence checks |
| DCP-019 | macOS signing, notarization, and update | macOS | Build path; no end-to-end updater test | low | BASE-002 | PKG-001, PKG-002 | Signed/notarized launch and update on supported macOS |
| DCP-020 | Linux packaging and desktop integration | Linux | Build path; no Playwright project | low | BASE-002, TST-005 | PKG-001, PKG-002 | Packaged launch, protocol, tray/menu, and representative E2E |
| DCP-021 | Settings and user-data migration | Windows, macOS, Linux | Partial settings tests; no modernization fixture | low | BASE-002 | PKG-003 | Released-version fixtures, recovery path, no silent loss/corruption |

## Coverage interpretation

A capability cannot reach `high` confidence solely through unit mocks. Security-sensitive capabilities also require the corresponding invariant tests. A platform-independent policy may be tested once, but each native integration must have representative evidence on every platform claimed in its row.
