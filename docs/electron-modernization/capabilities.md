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
| DCP-002 | Multi-account add/switch/remove | Windows, macOS, Linux | Critical/regression E2E; sensitivity-proven reducer lifecycle contract; secure-shell exact-target, partition, IPC, and storage-isolation tests | medium | BASE-002, TST-004 | CAP-001 | Product action routing, lifecycle E2E, and packaged three-account switch/remove smoke |
| DCP-003 | Enterprise and automated SSO | Windows, macOS, Linux | 18 characterization tests including a deterministic Electron fixture; three CAP-002 security targets quarantined | medium | TST-002 | CAP-002 | Controlled IdP E2E, protocol abuse tests, cookie/account isolation, cleanup |
| DCP-004 | Logout, data clearing, and persistence | Windows, macOS, Linux | Logout and account-removal E2E; secure-shell exact-session local-storage/cookie deletion test with cross-account retention | medium | BASE-002 | CAP-001, PKG-003 | Per-account deletion tests and released-version migration fixtures |
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

## Acceptance validation

`Automated`, `packaged`, and `manual` are separate obligations. `N/A` requires an approved scope decision; an empty result never implies a pass.

| ID | Required behavior | Automated validation | Packaged validation | Manual/provider validation | Acceptance authority |
| --- | --- | --- | --- | --- | --- |
| DCP-001 | Login/registration opens the intended account in its isolated session | Critical login/register E2E and partition assertion | Fresh-profile login on each supported OS | Mandatory backend/federation variants | Product; Security for session boundary |
| DCP-002 | Add/switch/remove affects only the selected account and routes activation correctly | Lifecycle E2E plus cross-account IPC/storage deny tests | Three-account switch/remove smoke | Keyboard/accessibility review | Product and Security |
| DCP-003 | SSO uses one-time validated responses and moves only intended cookies to the intended account | Protocol abuse, lifecycle, cookie isolation, controlled IdP fixture | SSO launch/cancel/success on each OS | Approved IdP/federation matrix under Q-002 | Product and Security |
| DCP-004 | Logout/removal clears only approved state and retained state survives restart | Per-account deletion and restart/migration fixtures | Logout/remove/relaunch smoke | Data-retention expectation review | Product and Security |
| DCP-005 | Tray/menu actions and unread state match the active application/account state | Policy and platform-adapter tests | Native tray/menu/tooltip smoke per OS | Visual and accessibility check | Product and Platform |
| DCP-006 | Notifications/badges activate the correct account/conversation without data crossover | Routing and deny tests | Signed notification, app badge, overlay/bounce smoke | OS settings/permission review | Product, Security, Platform |
| DCP-007 | Camera/microphone work only for authorized Wire views and user flows | Permission allow/deny plus fake-device call E2E | One call smoke per OS | Native permission prompt/revocation | Product and Security |
| DCP-008 | Display capture requires authorized origin/view and user choice | Source-selection, gesture, cancel, hostile-view tests | Screen-share smoke per OS; macOS audio where supported | Native chooser and permission review | Product and Security |
| DCP-009 | PiP has fixed safe preferences, correct lifecycle, and no navigation escape | Preference/navigation/focus/cleanup tests | Create/interact/close smoke per OS | Accessibility/always-on-top review | Product and Security |
| DCP-010 | Valid deep links route once at every lifecycle point; malformed/hostile inputs do nothing privileged | Parser and startup/second-instance matrix | Registered-protocol fresh/running-app smoke | OS browser invocation | Product and Security |
| DCP-011 | Proxy settings/auth apply only to intended sessions and cancellation fails closed | Parser, credential, callback, cancellation, session-scope tests | Authenticated proxy smoke per OS | Enterprise proxy variants | Enterprise Product and Security |
| DCP-012 | Certificate failures and approved enterprise exceptions are scoped, explicit, and fail closed | Pin/Chromium failure, retry, persistence, scope tests | Interception smoke per OS | Approved interception products under Q-005 | Security and Enterprise Product |
| DCP-013 | Managed config is read from the correct backend and exposed as immutable authorized policy | Backend fixtures and bridge authorization | Managed/unmanaged profile smoke per OS | MDM/registry deployment | Enterprise Product and Security |
| DCP-014 | Only approved external schemes leave the app; context actions do not expose broader privilege | URL/protocol/encoding deny matrix | Default-browser and context-menu smoke | OS association review | Product and Security |
| DCP-015 | Open Graph retrieval accepts only safe destinations/content within hard limits | SSRF, DNS/redirect, credential, time, byte, type tests | N/A after policy approval | Enterprise proxy interaction if retained | Security and Product |
| DCP-016 | Encryption/decryption is available only to the owning authorized account contract | Schema, sender, cross-account, size/error tests | Keychain/credential-store round trip per OS | Locked/unavailable key store behavior | Security |
| DCP-017 | Signed Squirrel install/update/rollback preserves state and protocol ownership | Selection/version/update metadata tests | Fresh, upgrade, rollback, uninstall on supported Windows | Windows enterprise coexistence | Release Engineering and Security |
| DCP-018 | MSI install/upgrade/repair/uninstall and Squirrel coexistence follow the approved deployment contract | Build/selection tests after upstream merge | Signed Windows matrix | Software-deployment tooling | Enterprise Product and Release Engineering |
| DCP-019 | Signed/notarized macOS app launches, notifies, updates, and survives restart | Build config/update metadata tests | Signed/notarized install/update/rollback | Gatekeeper and permission prompts | Release Engineering and Security |
| DCP-020 | Linux artifact installs/launches with protocol, tray/menu, sandbox/fuses, and defined feature parity | Build config and representative E2E | AppImage/deb/rpm install/launch as approved | Desktop-environment matrix under Q-006 | Product and Platform |
| DCP-021 | Released user state migrates without silent loss and has recovery/rollback | Versioned fixtures, interrupted/corrupt migration tests | Upgrade and rollback from approved releases per OS | Recovery messaging and support procedure | Product and Security |

The matrix is complete as an engineering acceptance specification. Q-008 maps its role labels to the solo maintainer; they remain useful descriptions of the decision being made rather than claims that several reviewers exist. Merging PR #1 records the maintainer's M0 acceptance of this matrix, which is then recorded by the M0 closure PR.

## Coverage interpretation

A capability cannot reach `high` confidence solely through unit mocks. Security-sensitive capabilities also require the corresponding invariant tests. A platform-independent policy may be tested once, but each native integration must have representative evidence on every platform claimed in its row.
