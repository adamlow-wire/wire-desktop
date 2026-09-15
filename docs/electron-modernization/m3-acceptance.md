# M3 acceptance audit — September 15, 2026

M3 is accepted under the maintainer-approved scope at integration `45840fca7eea1a4975e5e1f58bd54c6c2d911289`, whose tree is identical to reviewed and fully qualified `5c5961870b8fc1fc1792388f69cbe4e935b3e7dc` in [PR #56](https://github.com/adamlow-wire/wire-desktop/pull/56). This audit starts from actual code, branch/PR history and final-head evidence, not a previous completion estimate. All sixteen M3 work items are reconciled below. Only the startup PR remained open before this closure; the existing branch was reused and no parallel implementation branch was introduced.

The final source review found and corrected credential-bearing action/settings/proxy diagnostics in [PR #55](https://github.com/adamlow-wire/wire-desktop/pull/55), then a real startup redirect teardown exposed by its retained macOS retry. PR #56 supplies sensitive native/product baselines, bounded authorized replacement completion and non-secret startup errors. The final Windows retry is retained and assigned to TST-005 fixture setup, as detailed below. This is the implementation review; independent release security review remains M5.

## SEC-002

ViewIdentityRegistry and AuthorizedIpc enforce native contents/session/main-frame/origin identity and immutable main-owned account capabilities. Native registry/IPC tests cover unknown, destroyed, subframe, foreign and payload-forged identities. Integrated in PR #13 and maintained through account cutover PR #47.

- [x] Unknown, destroyed, unexpected-frame, and origin-mismatched senders fail closed.
- [x] Identity cannot be supplied or overridden by renderer payload data.
- [x] Unit and integration tests cover authorized and unauthorized senders.

## SEC-003

security/\*Contract.ts and AuthorizedIpc define fixed channels, schemas, view roles, origin policy, failure mode and rate/size limits. Named immutable preload bridges expose no generic IPC/event objects. Positive/unauthorized/malformed suites and source inventory cover each privileged operation (PRs14–32 and subsequent narrow contracts).

- [x] No bridge exposes raw `send`, `invoke`, `on`, Electron event objects, or arbitrary channel names.
- [x] Every privileged channel declares permitted view types, origins, request schema, response schema, and failure behavior.
- [x] Every privileged channel has positive, unauthorized-sender, and invalid-payload tests.
- [x] Payload size and rate limits exist where abuse could consume material resources.

## SEC-004

Production dependency/source/lockfile scan has no @electron/remote, remoteMain.initialize or remoteMain.enable. Account context-menu and theme policy/receiver suites preserve native behavior (PR #33).

- [x] `@electron/remote` is absent from production dependencies and source.
- [x] No `remoteMain.initialize` or `remoteMain.enable` remains.
- [x] Theme and context-menu behavior pass their capability tests.

## SEC-005

installWebappPreload, WebappBridge/MainWorld and shell bridges use isolated immutable named APIs plus fixed compatibility adapters. Effective-runtime preference and event/bridge tests exercise no Node/Electron/raw IPC reachability and preserve webapp compatibility (PR #35).

- [x] `contextIsolation: true` is enforced for every renderer.
- [x] Preloads do not mutate shared `window`/`global` state outside reviewed bridge exposure.
- [x] Bridge values and callbacks do not leak Electron event objects or privileged closures.
- [x] Bridge compatibility with the Wire webapp is versioned and tested.

## SEC-006

main.ts enables the application sandbox before mainProcess loading. Browser-target preload bundles and all native view constructors preserve sandbox/context isolation and disabled Node/worker integration. Effective preferences and real worker/product probes cover each role (PR #37 and later view suites). No exception introduced.

- [x] Remote and local renderers run sandboxed in development and packaged builds.
- [x] `nodeIntegration` and `nodeIntegrationInWorker` remain disabled.
- [x] CI asserts effective `webPreferences` for every window/view type.
- [x] Any exception has a time limit, owner, threat analysis, and removal work item.

## SEC-007

AccountViews owns WebContentsView creation, bounds, focus, hide/show and recovery. AccountController/Profile/State own lifecycle and partitions. Production source has no webview/allowpopups. Native lifecycle and actual profile/restart fixtures prove cross-account cookie/storage isolation (PR #47).

- [x] `webviewTag` is disabled and application source contains no `<webview>` element.
- [x] No `allowpopups` behavior remains.
- [x] Account views resize, focus, hide/show, crash, reload, add, remove, and switch correctly.
- [x] Session-isolation tests prove accounts cannot observe each other's storage/cookies.

## SEC-008

NavigationPolicy/Guard and AccountWindowPolicy authorize actual registered source identity and exact account origins; controlled blank/same-origin PiP and isolated main-created SSO cover legitimate flows. Navigation, popup, external-link and real account/E2EI transport deny tests prove rejection before foreign requests (PR #38 and follow-up).

- [x] Unexpected navigation is prevented, not merely logged.
- [x] New windows default to deny.
- [x] Allowed SSO/PiP windows use fixed reviewed preferences.
- [x] External URLs use protocol and origin policy with adversarial tests.

## SEC-009

AccountPermissionPolicy/Session/Consent default deny and bind notification/audio/video grants to native account/frame/origin and owner-controlled user consent. Navigation/hide/close/crash cancellation and async generation checks revoke stale authority. Empty-media, subframes, unknown permissions and desktop enumeration remain denied (PR #48/47).

- [x] Permissions default to deny.
- [x] Grants bind permission type to authorized origin, view, account, and user flow.
- [x] Main-frame and subframe behavior is defined.
- [x] Allowed and denied cases are tested on supported platforms.

## SEC-010

LocalContentPolicy/Protocol serve seven fixed role-specific assets through wire-app with only standard/secure privileges, GET/HEAD and exact session/document identity. CSP denies eval/Function in production and development. Conditional legacy migration reader is script-disabled; actual storage migration/restart passes (PR #50).

- [x] Local application content does not depend on `file://`.
- [x] Production CSP does not include `unsafe-eval`.
- [x] Custom protocol privileges are minimal and tested.
- [x] Development-only relaxations cannot reach production builds.

## SEC-012

PublicNetworkPolicy/PublicResourceFetch validate protocol/default port, all DNS addresses and each redirect, pin addresses, exclude ambient cookies/proxy credentials and bound wire/decoded size, time and redirects. PreviewMetadata bounds parsing and ignores arbitrary object paths. Sensitivity and native hostile destination tests cover denials (PR #44).

- [x] Only required protocols are accepted.
- [x] Loopback, link-local, private, metadata-service, and otherwise prohibited destinations are handled by explicit policy.
- [x] Every redirect target is revalidated.
- [x] Response byte, time, redirect, and parsing limits are tested.
- [x] Renderer-controlled fetches do not receive privileged ambient credentials.

## SEC-013

deepLinkPolicy/dispatchDeepLink and externalLinkPolicy accept bounded explicit routes, reject malformed/encoded/oversized/recursive/scheme-confused inputs and dangerous external protocols. Native lifecycle delivery cannot invent authority (PR #39/38/51).

- [x] Happy paths, malformed input, oversized input, encoded-delimiter, protocol-confusion, and recursion cases are tested.
- [x] Deep links cannot invoke arbitrary IPC or navigation.
- [x] External links cannot invoke dangerous local protocols.

## TST-003

TrayHandler injectable runtime/native tests assert click/open/quit, tooltip, zero/nonzero badges, Windows overlay, actual macOS bounce invocation and Linux variants. Packaged visible OS affordance qualification remains explicitly assigned to CAP-004/PKG001 rather than claimed from unit spies (PR #12 accepted characterization scope).

- [x] Platform branches are tested through injectable adapters or platform CI.
- [x] macOS tests assert `dock.bounce` rather than unconditionally passing.
- Packaged visible tray/menu/tooltip smoke remains assigned to CAP-004/PKG-001, as explicitly recorded in accepted PR #12 and the maintainer’s pre-packaging scope. It is not claimed as completed characterization evidence.

## CAP-001

Main-owned AccountController/View/Profile state and typed account contracts preserve add/switch/remove/logout/clear/recovery, constrain metadata and destinations, and isolate account sessions/IPC. Native plus real accountLifecycle/accountMetadata and authenticated multi-account tests verify targeted cleanup and retained state across normal native restart (PR #47).

- [x] Approved same-origin startup redirects preserve a live account only after the replacement document completes; real failures, foreign destinations and stale ownership are rejected. Native errors omit credential-bearing URLs.
- [x] Existing multi-account critical and regression flows pass.
- [x] Cross-account session and IPC isolation tests pass.
- [x] Removal deletes only the selected account's intended data.

## CAP-002

SingleSignOn/SsoWindowCoordinator use fixed secure isolated views, ephemeral sessions and one-use flow secrets. Real backend-style redirects prove success/error verdict, exact owning account cookie transfer, replay/foreign/cancel denial. Three E2EI-shaped product outcomes assert exact query/sessionStorage and rejected foreign navigation. PR #53 closes approved automated scope; live Keycloak/OIDC/ACME enrolment/restart/renewal remains unrun downstream QA.

- [x] TST-002 passes against the new implementation.
- [x] Every CAP-002 `security-target` quarantine in the SSO suite is removed and passes.
- [x] SSO windows use fixed secure preferences and ephemeral sessions.
- [x] Account targeting and cookie transfer cannot cross partitions.
- [x] The real backend verdict is delivered without a renderer opener, with success/error and backend error-label compatibility; synthetic direct finalization alone is insufficient.
- [x] M3 automated acceptance covers desktop-owned E2EI transport and account/session boundaries using deterministic fixtures. It must include allowed same-origin callback transport and rejected foreign navigation, and reuse sensitive SSO callback/replay/cancellation/account-isolation tests. It does not claim OIDC authentication, ACME issuance or verified-device state.
- [x] Deterministic desktop tests cover cancellation, provider/backend failure and invalid or foreign-account callbacks where desktop owns the behavior. No arbitrary cross-origin account navigation or privileged bridge authority is added for IdP pages. Real enrolment, renewal/silent-auth fallback and retained verified-device state remain mandatory downstream QA checks.
- [x] Deterministic desktop boundary tests run against the refactored application with final supported-platform CI evidence. The live Keycloak/SSO/E2EI checkpoint is handed to QA using `qa-sso-e2ei.md`; it is not an M3 completion gate after the maintainer-approved September 14 scope revision. Customer E2EI compatibility remains unqualified until QA records those results; a missing live environment is never a skipped pass.

## CAP-005

ManagedConfig/WindowsMachineDestination and enforced-download policies enforce immutable authorized settings and fail-closed configured-invalid endpoints. ProxyAuth/PromptCoordinator bind credential use and async application to exact challenge/session, with real proxy traffic tests. CertificateVerifyProcManager denies errors once, retains explicit native pinning policy and always preserves Chromium verification. PR #49/52/54 final platform evidence qualifies approved scope; independent broad-override review remains explicit.

- [x] Proxy credentials are handled only by the intended prompt and session.
- [x] Certificate verification and exception behavior are characterized and fail closed.
- [x] Managed configuration is read through an authorized, immutable contract.
- [x] Enforced Windows download paths are normalized and cannot traverse outside the approved base or select device/UNC targets.
- [x] Windows, macOS, and Linux managed-config backends have representative tests.

## CAP-006

Strict dispatch plus WindowManager/AccountController preserve pre-ready/running deep links and exact selected-account delivery; real second-Electron fixture verifies zero loser exit and no stale profile writes, with exact Squirrel installer handling (PR #51). Final audit found INV-010 diagnostic credential exposure; PR #55 removes only payloads and adds sensitive immediate/queued, settings round-trip and startup-log tests. PR #55 final gates pass: all three native platforms and full 47-case Windows/macOS E2E/report. The correction is integrated at `4f4cfdaa`.

- [x] Action, stored-settings and proxy-startup diagnostics contain no credential payloads.
- [x] Valid links work before and after application readiness.
- [x] Invalid and hostile links fail closed.
- [x] Second-instance delivery cannot target an unauthorized view or invoke arbitrary actions.

## Security boundaries and acceptance limits

Electron 43.4.0 remains pinned. M3 claims INV-001–008 and INV-010 architectural boundary enforcement, not INV-009 production release integrity. Packaging/signing/installers/update/migration/rollback and independent release security review remain later work. The approved broad native pinning override is preserved and cannot override Chromium verification; there is no MDM pinning policy to enforce. SafeStorage provides OS-user encryption behind authorized bounded account IPC; it does not establish account-specific cryptographic keys or protection from OS-user compromise. Display capture stays denied until functional M4 supplies source consent. Native CI gives actual platform evidence; a macOS-named Playwright project executed on Linux is Linux evidence only. Live customer E2EI compatibility is unqualified until QA records real results.

Final local validation of `5c596187` passes `yarn test`: 112 Jest, 923 main, four media, four renderer and 38 build-tool cases, with application/Mocha types and TypeScript-then-bundle builds. Rebuilt Linux navigation/proxy product validation passes six cases in 11.0 seconds using isolated profiles and a private native keyring. Native wiring/origin/ownership and diagnostic perturbations fail the intended targets and are restored.

Fresh coverage measures **all M3 changes** against completed M2 `fe0b86cbd05a49ef84e785478f7e32995d161792`: **3245/3830 changed statements (84.73%, required 80%)**, and **840/853 tracked security-policy branches (98.48%, required 90%)**. The latter is the collector’s explicit policy-file subset, not a claim about every security-relevant branch. Commands: `yarn test`; `DIFF_COVERAGE_BASE=fe0b86cbd05a49ef84e785478f7e32995d161792 yarn coverage`; rebuilt `yarn test:e2e --project=macOS e2e-tests/specs/regression/accountNavigation.spec.ts e2e-tests/specs/regression/proxySession.spec.ts --reporter=line` on Linux. The project label does not change the host platform.

## Final hosted evidence

| Gate | Exact-head result |
| --- | --- |
| [Build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34913964547) | Pass |
| [Lint](https://github.com/adamlow-wire/wire-desktop/actions/runs/34913964571) | Pass |
| [CodeQL](https://github.com/adamlow-wire/wire-desktop/actions/runs/34913964622) | Pass |
| [Native Windows/macOS/Linux](https://github.com/adamlow-wire/wire-desktop/actions/runs/34913964577) | All pass on first attempts: 192 account cases each, 472 boundary cases on Linux/macOS and 473 on Windows, 11 product cases each, plus existing media/protocol/package gates |
| [Full authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34913964586) | 48 cases per platform; macOS 48 initial passes, Windows 47 initial plus one recovered case; combined report passes |

The intentional Windows registry-guard mutation fails and restoration passes; it is sensitivity evidence, not a flaky gate. Full E2E has no skipped tests or worker errors. The sole Windows retry is multi-account notification login readiness (60 seconds). Its retained artifact `10376407228` shows successful authentication, an account without a handle at `/auth/#/sethandle`, and an apostrophe in the generated name. Fixture code derives a handle from names and ignores the assignment response. That points to test-account setup, not the repaired native startup teardown; TST-005 owns valid fixture handles and failure propagation. No assertion or timeout was relaxed to accept this run.

Strict protection and all required final-head checks were re-read, no unresolved review threads remained, and PR #56 was SHA-guarded on merge. Superseded-head and skipped pre-label runs are not accepted evidence. Local integration/tree equality was verified after merge. Documentation-only closure changes reuse this identical runtime’s full E2E as a documentation-only record of the already executed M3 closure checkpoint while their applicable automatic checks must still pass.

## Next work

Complete functional M4: TST-005’s Linux/mandatory-check/artifact/fixture work, qualify the existing CAP-004 account-aware OS integrations, then implement and qualify CAP-003’s consented display capture and PiP lifetime. Live customer SSO/E2EI remains the explicit [QA handoff](qa-sso-e2ei.md). Packaging/signing/installers/updates, released-profile migration/rollback and independent release review remain in their assigned later work. None is reported as completed by this M3 audit.
