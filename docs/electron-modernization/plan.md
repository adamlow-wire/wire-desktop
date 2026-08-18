---
document_id: WIRE-DESKTOP-ELECTRON-MODERNIZATION
title: Wire Desktop Electron Modernization Plan
revision: 0.6.1
status: draft
updated: 2026-08-18
owners:
  technical: adamlow-wire
  security: adamlow-wire
  product: adamlow-wire
operating_model: solo AI-assisted maintainer
source_branch: integration/electron-modernization
upstream_base: e1ba98c50dce28b26b05466169fbdf941f0285f3
current_electron: 38.8.6
reference_latest_stable_electron: 43.4.0
reference_latest_checked: 2026-08-18
target_electron_rule: latest stable Electron at each release-candidate cut
priority_order:
  - supported Electron runtime
  - security boundary
  - required capability parity
  - packaging and rollout
  - non-critical improvements
---

# Wire Desktop Electron modernization plan

## 1. Purpose

This document is the authoritative, changeable plan for modernizing Wire Desktop's Electron wrapper. It is structured so that humans and AI agents can determine:

- What is in scope.
- Why an item exists.
- Its priority, status, dependencies, and acceptance criteria.
- Which decisions are settled and which remain open.
- How changes in scope must be recorded.

The implementation strategy is a replacement of the Electron security boundary inside a fork of this repository. Existing product behavior, platform knowledge, packaging, and migration behavior will be retained where they remain required. The legacy shell will remain available until the replacement passes the release gates in this document.

## 2. Normative language and update rules

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative.

AI agents and contributors updating this plan MUST follow these rules:

1. Treat the work item register in section 10 as the source of truth for implementation scope.
2. Do not delete or reuse an identifier. Mark removed work as `cancelled` or `superseded`.
3. When scope changes, update the affected scope and work items, increment `revision`, and append an entry to the change log.
4. A work item MUST NOT move to `done` until all of its acceptance criteria are satisfied with linked evidence.
5. If a dependency changes, update both the dependent item and the critical path.
6. Record new architectural choices in the decision log before relying on them in implementation.
7. Record newly discovered delivery or security risks in the risk register.
8. Do not weaken a security invariant merely to preserve legacy implementation details. Escalate the conflict as an open decision.
9. Refresh `reference_latest_stable_electron` before beginning an Electron upgrade and at every release-candidate cut.
10. Prefer small feature branches and reviewable commits. The integration branch is not a substitute for code review.

Allowed work item statuses are:

- `proposed`: Defined but not ready to start.
- `ready`: Dependencies and acceptance criteria are sufficient to begin.
- `in_progress`: Actively being implemented.
- `blocked`: Cannot progress; the blocker MUST be recorded.
- `done`: Acceptance criteria are satisfied and evidence is linked.
- `superseded`: Replaced by another identified work item.
- `cancelled`: Intentionally removed from scope with a recorded reason.

Allowed priorities are:

- `P0`: Release-blocking runtime or security work.
- `P1`: Required product or platform parity.
- `P2`: Important hardening, maintainability, or operational improvement.
- `P3`: Optional improvement; not required for the first modernized release.

## 3. Executive decision

The project will:

1. Fork the repository and work through a protected `integration/electron-modernization` branch.
2. Bring the application onto the latest stable Electron release as an immediate P0 track.
3. Replace the legacy renderer/preload/IPC boundary with a sandboxed, context-isolated, least-privilege design as a parallel P0 track.
4. Replace DOM `<webview>` usage with main-process-owned `WebContentsView` instances unless an accepted architecture decision proves another option safer and simpler.
5. Remove `@electron/remote`.
6. Preserve required desktop capabilities through characterization tests and capability-by-capability migration.
7. Keep the legacy shell as a temporary fallback until release qualification is complete.
8. Open an upstream draft PR early enough to validate the architecture; the final mergeable PR will be produced from the integration branch after all mandatory gates pass.

This project is not a general rewrite of the Wire webapp.

## 4. Objectives and measures

| ID | Objective | Measure of completion |
| --- | --- | --- |
| OBJ-001 | Run a supported Electron version | The release candidate uses the latest stable Electron at RC cut, or has a time-limited approved exception. |
| OBJ-002 | Prevent remote-content compromise from becoming host compromise | All remote renderers are sandboxed and context-isolated, Node integration is disabled, and privileged operations require authorized typed IPC. |
| OBJ-003 | Prevent cross-account privilege and data leakage | Each account has an isolated session/partition and IPC authorization binds the sender to the correct account capability set. |
| OBJ-004 | Preserve required desktop behavior | Every retained capability has explicit acceptance criteria and passing tests on its supported platforms. |
| OBJ-005 | Make future Electron upgrades routine | An owner, cadence, automation, and compatibility test gate exist for Electron updates. |
| OBJ-006 | Produce an upstream-reviewable change | The final PR has a clear architecture narrative, migration evidence, security evidence, and a reviewable commit structure. |
| OBJ-007 | Preserve project context across a long-running effort | Humans and AI agents can recover current state, decisions, evidence, and the next bounded task without relying on chat history. |

## 5. Security invariants

These invariants are release blockers and take precedence over preserving legacy implementation mechanisms.

| ID | Invariant |
| --- | --- |
| INV-001 | Remote web content MUST run with `nodeIntegration: false`, `contextIsolation: true`, and renderer sandboxing enabled. |
| INV-002 | Remote content MUST NOT access `@electron/remote`, raw Electron APIs, Node APIs, or a generic IPC send/invoke function. |
| INV-003 | Every privileged IPC operation MUST validate sender identity, sender frame/origin, payload schema, and applicable account/view capability. |
| INV-004 | Account sessions MUST be isolated. One renderer MUST NOT read or mutate another account's storage, cookies, encryption operations, or desktop state. |
| INV-005 | Navigation, new-window creation, external URL opening, and custom-protocol dispatch MUST use explicit allow/deny policy. Logging an invalid navigation is insufficient. |
| INV-006 | Permissions MUST default to deny and be granted only to an authorized origin, view, permission type, and user flow. |
| INV-007 | Main-process network fetches initiated by a renderer MUST resist SSRF, unsafe redirects, oversized responses, and unsupported protocols. |
| INV-008 | Local wrapper content MUST have a restrictive CSP without `unsafe-eval` in production. |
| INV-009 | Production packages MUST apply reviewed Electron fuses, code signing, and integrity controls supported by the target platform. |
| INV-010 | Security-sensitive failures MUST fail closed and produce useful, non-secret diagnostic information. |

## 6. Current baseline

Baseline facts are observations, not target behavior.

| Area | Baseline on 2026-08-18 | Consequence |
| --- | --- | --- |
| Electron | `38.8.6`; Electron 38 is end-of-life | P0 runtime upgrade required. |
| Main wrapper | `contextIsolation: false`, `sandbox: false`, `webviewTag: true` | The current architecture conflicts with INV-001. |
| Remote account views | `<webview>`, `allowpopups`, unsandboxed preload, context isolation disabled | Replacement view architecture required. |
| Remote access | `@electron/remote` is enabled broadly | Must be removed. |
| IPC | Privileged handlers do not consistently authorize senders or validate payloads | Central authorization and typed schemas required. |
| Navigation | Some unexpected account-view navigation is logged but not prevented | Explicit navigation policy required. |
| CSP | Local wrapper permits `unsafe-eval` | Build and CSP changes required. |
| Fuses | Run-as-Node, `NODE_OPTIONS`, and CLI inspection are disabled; cookie encryption is enabled | Preserve and extend this useful baseline. |
| Unit/integration tests | No reliable aggregate coverage percentage or coverage threshold | Coverage instrumentation and security contracts required. |
| SSO tests | One direct test covers generated secret length | SSO characterization is P0 before migration. |
| Tray tests | Basic icon, unread, and flashing behavior is covered | Platform behavior and menu actions remain gaps. |
| E2E | Windows and macOS; nightly or label-triggered; no Linux project | CI expansion required before final qualification. |

The current source references supporting this baseline include:

- `package.json`
- `electron/src/main.ts`
- `electron/src/preload/preload-webview.ts`
- `electron/renderer/src/components/WebView/Webview.tsx`
- `electron/renderer/index.html`
- `bin/build-tools/lib/commonConfig.ts`
- `.github/workflows/build_test.yml`
- `.github/workflows/e2e-test.yml`

## 7. Scope register

| Scope ID | Area | Disposition | Priority | Notes |
| --- | --- | --- | --- | --- |
| SCP-001 | Electron runtime and dependent build tooling | replace/upgrade | P0 | Target latest stable Electron, not a fixed stale major. |
| SCP-002 | Window, view, preload, and IPC architecture | replace | P0 | Core security-boundary work. |
| SCP-003 | Multi-account session partitions | retain/redesign | P0 | Required for isolation and product parity. |
| SCP-004 | Enterprise SSO and automated SSO entry | retain/redesign | P0 | Security-sensitive capability. |
| SCP-005 | Navigation, links, deep links, and custom protocols | retain/harden | P0 | Includes single-instance dispatch. |
| SCP-006 | Camera, microphone, screen capture, calling, and PiP | retain/redesign | P1 | Permission boundary must be completed under P0 security policy. |
| SCP-007 | Tray, badges, notifications, menus, and shortcuts | retain | P1 | Platform-specific parity. |
| SCP-008 | Proxy authentication and configuration | retain/harden | P1 | Enterprise requirement. |
| SCP-009 | Certificate verification/pinning behavior | retain/harden | P0 | Must fail closed with tested exception flows. |
| SCP-010 | Managed configuration | retain | P1 | Preserve platform backends and policy behavior. |
| SCP-011 | Squirrel updates | retain during migration | P1 | Must coexist safely with MSI distribution. |
| SCP-012 | Windows MSI | retain | P1 | Preserve current managed-deployment contract. |
| SCP-013 | macOS distribution and updater | retain/harden | P1 | Signing/notarization and updater qualification required. |
| SCP-014 | Linux packaging and desktop integration | retain | P1 | Add representative E2E/smoke coverage. |
| SCP-015 | Wire webapp implementation | out of scope | N/A | Only explicit bridge-contract changes may be coordinated. |
| SCP-016 | Unrelated UI redesign | out of scope | N/A | Avoid coupling security migration to visual redesign. |
| SCP-017 | New product features | deferred by default | P3 | Require explicit scope-change approval. |

## 8. Delivery strategy and critical path

Three P0 tracks SHOULD proceed in parallel after M0:

- **Track A — Runtime:** Upgrade Electron one major at a time, resolve breaking changes, and land on the latest stable release.
- **Track B — Secure shell:** Build the replacement view, preload, IPC, navigation, and permission architecture.
- **Track C — Safety net:** Add characterization, security-contract, and compatibility tests needed to change behavior safely.

The project critical path is:

```text
M0 governance and reproducible baseline
  -> M1 current Electron runtime builds and passes baseline tests
  -> M2 secure single-account shell proves all security invariants
  -> M3 multi-account and security-sensitive capabilities migrate
  -> M4 remaining platform capability parity
  -> M5 packaged release qualification and external security review
  -> M6 final upstream PR and controlled rollout
```

An Electron upgrade alone does not complete the security project. Conversely, the replacement shell MUST NOT ship on an end-of-life Electron release.

## 9. Milestones and gates

| Milestone | Exit gate | Mandatory evidence |
| --- | --- | --- |
| M0 — Governed baseline | Fork, PR-only integration branch, accountable maintainer, CI baseline, capability inventory, and threat model exist | Branch/PR links, baseline report, maintainer-reviewed threat model |
| M1 — Supported runtime | Latest stable Electron builds and baseline tests pass on supported platforms | Version check, breaking-change log, CI runs, packaged smoke results |
| M2 — Secure shell proof | One account runs using the new architecture and satisfies INV-001 through INV-010 | Architecture tests, IPC policy tests, security review notes |
| M3 — Security-critical parity | Multi-account, SSO, certificate, navigation, permissions, and deep links use the new boundary | Capability tests and platform E2E evidence |
| M4 — Full required parity | All retained P1 capabilities pass their acceptance matrix | Completed capability matrix |
| M5 — Release qualified | Packaged upgrade/migration tests, external security review, and rollback exercise pass | Signed artifacts, reports, remediation closure |
| M6 — Upstream-ready | Integration branch is synchronized, documented, reviewed, and represented by a mergeable final PR | Final PR and release/rollout plan |

## 10. Work item register

### 10.1 Governance and baseline

#### GOV-001 — Establish fork and integration workflow

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: none
- Scope: Create the fork, configure `upstream`, protect `integration/electron-modernization`, define required checks, and record the upstream base commit.
- Acceptance:
  - Fork and protected integration branch exist.
  - Direct pushes are disabled for the integration branch.
  - The PR review policy and CI checks are configured for the declared operating model.
  - Upstream synchronization procedure is documented.
  - `upstream_base` in this document is populated.
- Evidence: [M0 PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1), [workflow specification](./governance.md), and GitHub API readback on 2026-08-18; the temporary pre-PR archive was deleted after ancestry verification

#### GOV-002 — Open early upstream architecture draft

- Priority: `P1`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: GOV-001, ARC-001
- Scope: Open a non-mergeable draft PR or upstream design discussion once the architecture skeleton is demonstrable.
- Acceptance:
  - Upstream can review the architecture before full migration cost is incurred.
  - Material feedback is represented as decisions, risks, or work-item changes here.
- Evidence: TBD

#### GOV-003 — Establish durable human and AI project memory

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: none
- Scope: Provide one discoverable project hub, authoritative scope, current handoff, testing contract, capability confidence matrix, ADR convention, and PR evidence template without adding runtime scaffolding.
- Acceptance:
  - Root agent guidance points to the project reading order and working rules.
  - Current state and the next executable work have one authoritative location.
  - Scope, decisions, risks, capabilities, and test evidence use stable identifiers.
  - Scope and handoff update rules prevent silent loss of history.
  - No production dependency or runtime abstraction is added.
- Evidence: commit `567be7646a61fdd725f7fdb693880a294d65d155`

#### BASE-001 — Capture a reproducible legacy baseline

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M0`
- Dependencies: GOV-001
- Scope: Record current build/test results, supported platforms, package outputs, startup behavior, and known failures without treating known insecure behavior as desired behavior.
- Acceptance:
  - Unit, renderer, build-tool, and available E2E results are recorded.
  - Packaged development builds are smoke-tested on Windows, macOS, and Linux.
  - Known flaky or environment-dependent tests are identified.
  - Baseline artifacts and logs are retained by CI.
- Evidence: [Legacy baseline and known gaps](./baseline.md); [PR #1 package run](https://github.com/adamlow-wire/wire-desktop/actions/runs/32187255739) retained passing Windows/macOS artifacts and a reproducible Linux failure; E2E remains pending

#### BASE-002 — Create the capability acceptance matrix

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M0`
- Dependencies: BASE-001
- Scope: For every `retain`, `retain/redesign`, or `retain/harden` scope entry, record supported platforms, current behavior, desired behavior, tests, migration owner, and acceptance evidence.
- Acceptance:
  - Every retained scope entry maps to at least one capability row.
  - Each row identifies automated, packaged-smoke, and manual validation requirements.
  - Product and security owners approve security-sensitive behavior.
- Evidence: [Capability and acceptance matrix](./capabilities.md); solo-maintainer acceptance is pending PR #1 merge

### 10.2 Architecture and security

#### ARC-001 — Approve target process and view architecture

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M0`
- Dependencies: SEC-001
- Scope: Produce an ADR covering the main process, local shell, `WebContentsView` account views, view ownership, session partitions, preload boundaries, and layout coordination.
- Acceptance:
  - The ADR explains why `<webview>` is removed or documents an approved exception.
  - Trust boundaries and data flows are diagrammed.
  - Account creation, destruction, crash recovery, focus, resize, and lifecycle are specified.
  - Security and platform owners approve the ADR.
- Evidence: [Proposed ADR 0001](./decisions/0001-process-and-view-architecture.md); solo-maintainer acceptance is pending PR #1 merge and will be recorded in the M0 closure PR

#### SEC-001 — Threat model the desktop wrapper

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M0`
- Dependencies: BASE-002
- Scope: Model remote webapp compromise, malicious navigation, compromised dependencies, hostile local environment, cross-account attacks, malicious deep links, SSRF, updater abuse, and renderer-to-main escalation.
- Acceptance:
  - Assets, trust boundaries, entry points, attackers, and mitigations are documented.
  - Each high-risk threat maps to an invariant and work item.
  - Residual risks have named owners and acceptance authority.
- Evidence: [Desktop wrapper threat model](./threat-model.md); solo-maintainer acceptance is pending PR #1 merge and will be recorded in the M0 closure PR

#### SEC-002 — Create a central view identity and capability registry

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: ARC-001
- Scope: Bind every `WebContents` and frame to a known view type, account identifier where applicable, allowed origins, session, and capability set.
- Acceptance:
  - Unknown, destroyed, unexpected-frame, and origin-mismatched senders fail closed.
  - Identity cannot be supplied or overridden by renderer payload data.
  - Unit and integration tests cover authorized and unauthorized senders.
- Evidence: TBD

#### SEC-003 — Introduce typed, validated, capability-specific IPC

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: SEC-002
- Scope: Replace ad hoc main/renderer IPC with a narrow versioned contract and runtime payload schemas.
- Acceptance:
  - No bridge exposes raw `send`, `invoke`, `on`, Electron event objects, or arbitrary channel names.
  - Every privileged channel declares permitted view types, origins, request schema, response schema, and failure behavior.
  - Every privileged channel has positive, unauthorized-sender, and invalid-payload tests.
  - Payload size and rate limits exist where abuse could consume material resources.
- Evidence: TBD

#### SEC-004 — Remove `@electron/remote`

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: SEC-003
- Scope: Replace `nativeTheme` and context-menu use of remote APIs with explicit main-process capabilities.
- Acceptance:
  - `@electron/remote` is absent from production dependencies and source.
  - No `remoteMain.initialize` or `remoteMain.enable` remains.
  - Theme and context-menu behavior pass their capability tests.
- Evidence: TBD

#### SEC-005 — Replace preloads with isolated bridges

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: SEC-003
- Scope: Use `contextBridge` to expose immutable, capability-specific APIs to the local shell and remote account content.
- Acceptance:
  - `contextIsolation: true` is enforced for every renderer.
  - Preloads do not mutate shared `window`/`global` state outside reviewed bridge exposure.
  - Bridge values and callbacks do not leak Electron event objects or privileged closures.
  - Bridge compatibility with the Wire webapp is versioned and tested.
- Evidence: TBD

#### SEC-006 — Enable renderer sandboxing everywhere

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: SEC-005
- Scope: Enable application-wide sandboxing with explicitly justified exceptions only if unavoidable.
- Acceptance:
  - Remote and local renderers run sandboxed in development and packaged builds.
  - `nodeIntegration` and `nodeIntegrationInWorker` remain disabled.
  - CI asserts effective `webPreferences` for every window/view type.
  - Any exception has a time limit, owner, threat analysis, and removal work item.
- Evidence: TBD

#### SEC-007 — Replace `<webview>` account rendering

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: ARC-001, SEC-005, SEC-006
- Scope: Implement account content with main-process-owned `WebContentsView` instances and preserve isolated persistent sessions.
- Acceptance:
  - `webviewTag` is disabled and application source contains no `<webview>` element.
  - No `allowpopups` behavior remains.
  - Account views resize, focus, hide/show, crash, reload, add, remove, and switch correctly.
  - Session-isolation tests prove accounts cannot observe each other's storage/cookies.
- Evidence: TBD

#### SEC-008 — Centralize navigation and window-open policy

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: SEC-002
- Scope: Enforce allowed origins, navigation types, external destinations, SSO windows, PiP windows, and denial behavior.
- Acceptance:
  - Unexpected navigation is prevented, not merely logged.
  - New windows default to deny.
  - Allowed SSO/PiP windows use fixed reviewed preferences.
  - External URLs use protocol and origin policy with adversarial tests.
- Evidence: TBD

#### SEC-009 — Centralize permission policy

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: SEC-002, SEC-003
- Scope: Implement request and check handlers for camera, microphone, notifications, display media, and any device permissions.
- Acceptance:
  - Permissions default to deny.
  - Grants bind permission type to authorized origin, view, account, and user flow.
  - Main-frame and subframe behavior is defined.
  - Allowed and denied cases are tested on supported platforms.
- Evidence: TBD

#### SEC-010 — Replace `file://` shell loading and tighten CSP

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: ARC-001
- Scope: Serve packaged local content through a privileged custom scheme and remove production `unsafe-eval`.
- Acceptance:
  - Local application content does not depend on `file://`.
  - Production CSP does not include `unsafe-eval`.
  - Custom protocol privileges are minimal and tested.
  - Development-only relaxations cannot reach production builds.
- Evidence: TBD

#### SEC-011 — Harden Electron fuses and package integrity

- Priority: `P0`
- Status: `proposed`
- Milestone: `M5`
- Dependencies: ELC-002, PKG-001
- Scope: Review all target-version fuses, preserve existing protections, and enable ASAR integrity/only-load-from-ASAR where correctly supported.
- Acceptance:
  - A documented fuse manifest exists for every platform package.
  - CI verifies effective fuse values in packaged binaries.
  - Integrity settings and code-signing order are compatible.
  - Development packages cannot be confused with production artifacts.
- Evidence: TBD

#### SEC-012 — Harden renderer-initiated network fetches

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: SEC-003
- Scope: Review or replace Open Graph and other main-process network operations for SSRF, redirects, protocols, DNS/IP ranges, response limits, cookies, and timeouts.
- Acceptance:
  - Only required protocols are accepted.
  - Loopback, link-local, private, metadata-service, and otherwise prohibited destinations are handled by explicit policy.
  - Every redirect target is revalidated.
  - Response byte, time, redirect, and parsing limits are tested.
  - Renderer-controlled fetches do not receive privileged ambient credentials.
- Evidence: TBD

#### SEC-013 — Harden deep-link and external-link handling

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: SEC-003, SEC-008
- Scope: Parse custom-protocol and external-link inputs with strict schemas and explicit action routing.
- Acceptance:
  - Happy paths, malformed input, oversized input, encoded-delimiter, protocol-confusion, and recursion cases are tested.
  - Deep links cannot invoke arbitrary IPC or navigation.
  - External links cannot invoke dangerous local protocols.
- Evidence: TBD

### 10.3 Electron and dependency currency

#### ELC-001 — Inventory Electron breaking changes and compatibility blockers

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: BASE-001
- Scope: Review breaking changes from Electron 39 through the current latest stable major, including Node/Chromium changes and deprecated APIs used by this repository.
- Acceptance:
  - Each breaking change is classified as applicable, not applicable, or requiring a work item.
  - Native modules, packaging tools, Playwright, electron-mocha, updater libraries, and signing tools are included.
  - Known blockers have owners and resolution paths.
- Evidence: [Electron 38-to-43 compatibility inventory](./electron-compatibility.md)

#### ELC-002 — Upgrade Electron to latest stable

- Priority: `P0`
- Status: `proposed`
- Milestone: `M1`
- Dependencies: BASE-001, ELC-001
- Scope: Upgrade one Electron major at a time from 38 to the latest stable release, resolving and testing each major transition. Refresh the target immediately before completion.
- Acceptance:
  - `package.json` pins the latest stable Electron available at completion.
  - All baseline unit, integration, type, lint, and required E2E tests pass.
  - Packaged apps launch on all supported operating systems.
  - The breaking-change log records every required code/configuration change.
  - No temporary compatibility flag weakens a security invariant without a tracked exception.
- Evidence: TBD

#### ELC-003 — Upgrade or replace Electron-adjacent dependencies

- Priority: `P0`
- Status: `proposed`
- Milestone: `M1`
- Dependencies: ELC-001
- Scope: Upgrade or replace incompatible/deprecated Electron-adjacent packages, prioritizing dependencies in privileged processes and removing abandoned packages.
- Acceptance:
  - Production dependency audit has no unaccepted high/critical finding.
  - Each replacement preserves required behavior with tests.
  - `@electron/remote` removal is handled by SEC-004, not upgraded in place.
- Evidence: TBD

#### ELC-004 — Establish an Electron currency policy

- Priority: `P0`
- Status: `proposed`
- Milestone: `M5`
- Dependencies: ELC-002
- Scope: Automate Electron update PRs and define ownership, test requirements, security-patch SLA, major-update SLA, and exception expiry.
- Acceptance:
  - The application remains within Electron's supported release window.
  - Security patch updates have a documented expedited path.
  - Major updates are tested automatically and are not accumulated into another multi-major migration.
  - An owner is accountable for update triage.
- Evidence: TBD

### 10.4 Test safety net

#### TST-001 — Make coverage reporting accurate

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: BASE-001
- Scope: Collect main, preload, and local-renderer coverage with source maps; include unexecuted source files; publish reports; and enforce targeted thresholds.
- Acceptance:
  - Coverage includes unimported source rather than only files touched by tests.
  - Generated files, locale data, and declarations are excluded consistently.
  - New security-policy modules require at least 90% branch coverage.
  - New/changed code uses a diff-coverage gate.
  - No arbitrary high global threshold is imposed on untouched legacy code.
- Evidence: commits `c27cfa6a41404f3835049d0553d6fbb7b17c4441` and `d96baaad0b4945f213921ad1515291bd7fef6a25`; local pipeline passed on 2026-08-18; the corrected gate rejected a historical TypeScript diff at 21.54% against its 80% requirement

#### TST-002 — Characterize enterprise SSO

- Priority: `P0`
- Status: `blocked`
- Milestone: `M0`
- Dependencies: BASE-002
- Scope: Cover SSO window/session lifecycle, protocol validation, authorization secret behavior, cookies, navigation, permissions, cancellation, errors, and cleanup.
- Acceptance:
  - Required legacy behavior has passing characterization tests whose sensitivity is demonstrated before implementation changes.
  - Invalid protocol, host, secret, response type, length, replay, order, cookie scope, and cleanup expectations exist as passing characterization or explicitly quarantined `security-target` tests owned by CAP-002.
  - SSO session creation, permission denial, success/error/cancellation paths, intended cookie transfer, navigation, and close cleanup are exercised without external IdP dependence.
  - At least one representative Electron integration flow uses a controlled test IdP or deterministic local fixture.
- Evidence: commit `c27cfa6a41404f3835049d0553d6fbb7b17c4441`: 16 characterization tests pass, three CAP-002 security targets are quarantined; protocol-condition sensitivity mutation produced the expected two failures and was reverted

#### TST-003 — Characterize tray, badge, notification, and menu behavior

- Priority: `P1`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: BASE-002
- Scope: Extend unit/platform tests for tray clicks, menu actions, zero/nonzero icon transitions, tooltip, app badge, Windows overlay, macOS bounce, and Linux icon variants.
- Acceptance:
  - Platform branches are tested through injectable adapters or platform CI.
  - macOS tests assert `dock.bounce` rather than unconditionally passing.
  - Packaged smoke tests cover visible platform integration where automation is practical.
- Evidence: TBD

#### TST-004 — Add security-boundary regression tests

- Priority: `P0`
- Status: `proposed`
- Milestone: `M2`
- Dependencies: SEC-002, SEC-003, SEC-008, SEC-009
- Scope: Assert effective web preferences, bridge surface, sender authorization, navigation policy, popup policy, permissions, session isolation, and fail-closed behavior.
- Acceptance:
  - Tests fail if context isolation or sandboxing is disabled.
  - Tests fail if Node, Electron, raw IPC, or remote APIs become reachable from remote content.
  - A hostile test page exercises unauthorized IPC and cross-account attempts.
- Evidence: TBD

#### TST-005 — Expand platform E2E and packaged smoke CI

- Priority: `P1`
- Status: `proposed`
- Milestone: `M4`
- Dependencies: BASE-001, PKG-001
- Scope: Add Linux coverage, make mandatory modernization checks non-optional, and distinguish development-mode E2E from packaged-app smoke tests.
- Acceptance:
  - Required integration-branch checks run on Windows, macOS, and Linux.
  - Security-critical smoke tests execute packaged artifacts.
  - Test artifacts, logs, screenshots, and traces are retained on failure.
  - Flaky tests have owners and bounded quarantine rules.
- Evidence: TBD

### 10.5 Capability migration

#### CAP-001 — Migrate account and multi-account lifecycle

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: SEC-007, TST-004
- Scope: Migrate account creation, persistent partitions, add/switch/remove, logout/clear-data, crash recovery, and account-targeted events.
- Acceptance:
  - Existing multi-account critical and regression flows pass.
  - Cross-account session and IPC isolation tests pass.
  - Removal deletes only the selected account's intended data.
- Evidence: TBD

#### CAP-002 — Migrate enterprise and automated SSO

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: TST-002, SEC-008, CAP-001
- Scope: Move SSO to the secure view/session/IPC architecture while preserving required identity-provider navigation.
- Acceptance:
  - TST-002 passes against the new implementation.
  - Every CAP-002 `security-target` quarantine in the SSO suite is removed and passes.
  - SSO windows use fixed secure preferences and ephemeral sessions.
  - Account targeting and cookie transfer cannot cross partitions.
- Evidence: TBD

#### CAP-003 — Migrate calling, media, display capture, and PiP

- Priority: `P1`
- Status: `proposed`
- Milestone: `M4`
- Dependencies: SEC-003, SEC-007, SEC-009
- Scope: Replace legacy global APIs for desktop capture and migrate call/PiP window behavior.
- Acceptance:
  - Existing call E2E passes without exposing unrestricted desktop capture.
  - Display capture is initiated only by an authorized view and user flow.
  - PiP windows use fixed secure preferences and controlled navigation.
  - Permission-denied behavior is tested.
- Evidence: TBD

#### CAP-004 — Migrate tray, notification, badge, menu, and shortcut integration

- Priority: `P1`
- Status: `proposed`
- Milestone: `M4`
- Dependencies: TST-003, SEC-003, CAP-001
- Scope: Route OS integration through explicit main-process capabilities and preserve account-aware behavior.
- Acceptance:
  - TST-003 and existing menu/notification E2E pass.
  - Renderer data cannot invoke arbitrary menu commands.
  - Notification activation targets the correct account/conversation.
- Evidence: TBD

#### CAP-005 — Migrate proxy, certificate, and managed configuration

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: SEC-003, SEC-009, TST-004
- Scope: Preserve enterprise network behavior without global or unauthenticated renderer authority.
- Acceptance:
  - Proxy credentials are handled only by the intended prompt and session.
  - Certificate verification and exception behavior are characterized and fail closed.
  - Managed configuration is read through an authorized, immutable contract.
  - Windows, macOS, and Linux managed-config backends have representative tests.
- Evidence: TBD

#### CAP-006 — Migrate deep links and single-instance behavior

- Priority: `P0`
- Status: `proposed`
- Milestone: `M3`
- Dependencies: SEC-013, CAP-001
- Scope: Preserve conversation, user, login, and SSO links while safely routing them to the intended account/window.
- Acceptance:
  - Valid links work before and after application readiness.
  - Invalid and hostile links fail closed.
  - Second-instance delivery cannot target an unauthorized view or invoke arbitrary actions.
- Evidence: TBD

### 10.6 Packaging, update, and rollout

#### PKG-001 — Qualify packaging on the target Electron version

- Priority: `P1`
- Status: `proposed`
- Milestone: `M4`
- Dependencies: ELC-002, ELC-003
- Scope: Build Windows Squirrel, Windows MSI, macOS, and Linux artifacts using the target runtime and reviewed tooling.
- Acceptance:
  - Every supported artifact builds reproducibly in CI.
  - Signing, notarization, fuse flipping, and integrity operations occur in the correct order.
  - Artifact identity and environment separation are preserved.
- Evidence: TBD

#### PKG-002 — Qualify installers and updater behavior

- Priority: `P1`
- Status: `proposed`
- Milestone: `M5`
- Dependencies: PKG-001, CAP-001
- Scope: Test fresh install, launch, update/upgrade, repair where applicable, uninstall, protocol registration, auto-launch, and retained user data.
- Acceptance:
  - Squirrel installations continue using Squirrel updates.
  - MSI installations do not invoke Squirrel and satisfy `docs/windows-msi.md`.
  - macOS update behavior is verified with signed/notarized artifacts.
  - Linux package launch and desktop integration are verified.
- Evidence: TBD

#### PKG-003 — Validate legacy-to-modernized data migration

- Priority: `P0`
- Status: `proposed`
- Milestone: `M5`
- Dependencies: CAP-001, PKG-002
- Scope: Upgrade representative released installations without losing accounts, settings, managed configuration, or required cached state.
- Acceptance:
  - Migration fixtures cover supported legacy versions and install types.
  - Account/session changes have documented recovery and rollback behavior.
  - A failed migration does not silently corrupt or delete user data.
- Evidence: TBD

#### REL-001 — Complete independent security review

- Priority: `P0`
- Status: `proposed`
- Milestone: `M5`
- Dependencies: SEC-001, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, SEC-010, SEC-011, SEC-012, SEC-013, CAP-001, CAP-002, CAP-003, CAP-004, CAP-005, CAP-006
- Scope: Conduct focused code review and penetration testing of renderer escape, IPC, navigation, session isolation, SSO, deep links, network fetches, and update integrity.
- Acceptance:
  - Critical and high findings are resolved before release.
  - Medium findings are resolved or explicitly accepted with owners and expiry.
  - Retesting confirms remediation.
- Evidence: TBD

#### REL-002 — Prepare final upstream PR and rollout

- Priority: `P1`
- Status: `proposed`
- Milestone: `M6`
- Dependencies: GOV-002, ELC-004, TST-005, PKG-003, REL-001
- Scope: Synchronize upstream, prepare final review material, define staged rollout, monitoring, rollback, and legacy-shell removal conditions.
- Acceptance:
  - All P0 and P1 work items required for first release are `done` or have approved exceptions.
  - Final PR explains architecture, security properties, compatibility, testing, and migration.
  - Rollout begins with a limited cohort and has measurable stop conditions.
  - Legacy shell removal is a separate explicit decision after rollout confidence.
- Evidence: TBD

## 11. Required test model

The project MUST use multiple test layers. No single coverage percentage can demonstrate desktop security or platform parity.

| Layer | Purpose | Required examples |
| --- | --- | --- |
| Pure unit | Policy and parsing correctness | Origin rules, schemas, deep links, permission decisions, fuse configuration |
| Electron integration | Effective runtime behavior | Web preferences, IPC sender identity, session partitions, window/view lifecycle |
| Hostile-renderer integration | Security regression | Unauthorized IPC, Node/Electron reachability, popup/navigation attempts, cross-account access |
| Development E2E | Product flow parity | Login, multiple accounts, messaging, calling, SSO, logout |
| Packaged smoke | Packaging/runtime differences | Launch, protocol registration, tray, permissions, signing/integrity |
| Installer/update | Distribution correctness | Squirrel update, MSI upgrade, macOS update, Linux install/launch |
| Manual/platform | OS behavior difficult to automate | Tray visuals, permission prompts, signing dialogs, managed deployment |
| Independent security review | Adversarial assurance | Renderer escape, IPC abuse, SSRF, session crossover, updater abuse |

Security tests MUST assert the absence of dangerous capability, not only successful product flows.

## 12. Branch and PR policy

1. `fork/main` tracks upstream and MUST NOT contain modernization-only commits.
2. `integration/electron-modernization` is protected and receives reviewed feature PRs.
3. Feature branches SHOULD use the work item ID, for example `sec/SEC-003-typed-ipc`.
4. Every feature PR MUST identify work item IDs, affected invariants, tests, and rollback impact.
5. Upstream changes SHOULD be merged into the integration branch on a regular cadence and before each milestone exit.
6. Shared integration history SHOULD NOT be rebased.
7. The upstream draft PR MAY contain incomplete capability work but MUST clearly report which gates remain open.
8. The final upstream PR MUST be based on a recently synchronized upstream commit and MUST contain no unexplained generated or unrelated changes.

## 13. Release blockers

The first modernized release MUST NOT ship if any of these conditions is true:

- Electron is outside its supported release window without an approved, expiring exception.
- Any remote renderer is unsandboxed or lacks context isolation.
- `@electron/remote`, raw IPC, or Node APIs are reachable from remote web content.
- A privileged IPC handler lacks sender authorization or payload validation.
- Cross-account session/IPC isolation tests fail or are absent.
- Navigation, popup, permission, SSO, or deep-link policy fails open.
- A known critical/high security finding is unresolved.
- Required legacy-to-modernized data migration has not been tested.
- Required Windows, macOS, or Linux artifacts cannot be built and launched.
- Signed production update/upgrade paths have not been exercised.
- There is no tested rollback or rollout-stop procedure.

## 14. Risk register

| Risk ID | Risk | Likelihood | Impact | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-001 | The remote webapp depends on shared-context preload globals that cannot cross `contextBridge` unchanged | high | high | Version the bridge; coordinate minimal webapp adapter changes; prove early in M2 | TBD | open |
| RSK-002 | Multi-major Electron upgrade and architecture replacement interact unpredictably | medium | high | Upgrade one major at a time; keep runtime and secure-shell tracks separately testable | TBD | open |
| RSK-003 | Long-lived integration branch diverges from upstream | high | medium | Frequent upstream merges, named owner, early draft PR | TBD | open |
| RSK-004 | Existing tests preserve product behavior but not security boundaries | high | high | TST-002 and TST-004 precede sensitive migration | TBD | open |
| RSK-005 | Real SSO providers are difficult to automate | high | high | Controlled IdP fixture plus a representative manual/provider matrix | TBD | open |
| RSK-006 | `WebContentsView` layout/focus/accessibility differs from DOM `<webview>` | medium | medium | Architecture spike and cross-platform interaction tests in M2 | TBD | open |
| RSK-007 | Security changes break calling, display capture, notifications, or enterprise network flows | high | high | Capability-specific bridges and permission tests; staged migration | TBD | open |
| RSK-008 | Packaged behavior differs from development-mode E2E | high | high | Mandatory packaged smoke and installer/update test layers | TBD | open |
| RSK-009 | User data or session state is lost during partition/architecture migration | medium | critical | Versioned migration, fixtures from released builds, backup/recovery design | TBD | open |
| RSK-010 | Final upstream review is too large to complete effectively | high | high | Early architecture feedback, work-item commits, subsystem review packets | TBD | open |
| RSK-011 | Knowledge is concentrated in too few Wire developers and is lost between implementation periods | high | high | Stable project IDs, baseline contracts, concise ADRs, current handoff, small PRs, and cross-review of security-sensitive work | TBD | open |
| RSK-012 | Packaging code catches errors and CI can appear successful without producing an artifact | high | high | Assert artifact existence, make package errors fatal under PKG-001, and retain runner logs | Release Engineering | open |
| RSK-013 | Solo development concentrates product, platform, and security decisions in one maintainer | high | high | PR-only integration, strict CI, explicit security-review passes, sensitive-test demonstrations, concise decision records, and external review before release when feasible | adamlow-wire | open |

## 15. Decision log

| Decision ID | Date | Status | Decision | Rationale | Revisit condition |
| --- | --- | --- | --- | --- | --- |
| DEC-001 | 2026-08-18 | accepted | Modernize through a replacement Electron shell inside a fork rather than rewriting the whole product or only flipping legacy flags | Preserves platform knowledge while allowing a new security boundary | New evidence shows retained code creates more risk than replacement |
| DEC-002 | 2026-08-18 | accepted | Use a protected integration branch feeding a final upstream PR | Supports staged capability work and final integration testing | Upstream requests a different contribution strategy |
| DEC-003 | 2026-08-18 | accepted | Supported Electron runtime and security-boundary work are P0 | The current runtime is EOL and the current boundary violates modern Electron security guidance | Never; only implementation ordering may change |
| DEC-004 | 2026-08-18 | proposed | Use `WebContentsView` for remote account content | Electron discourages `<webview>`; main ownership improves policy control | ARC-001 identifies a safer supported architecture |
| DEC-005 | 2026-08-18 | accepted | Target latest stable Electron dynamically, not version 43 permanently | Prevents this plan becoming stale during a long migration | Electron release/support policy materially changes |
| DEC-006 | 2026-08-18 | accepted | Operate as a solo AI-assisted maintainer with PR-only integration and zero required external approvals | Preserves traceability and automated gates without pretending unavailable organizational review exists | Additional maintainers join or upstream mandates another process |

## 16. Open questions

| Question ID | Question | Needed by | Owner | Resolution |
| --- | --- | --- | --- | --- |
| Q-001 | Which Windows, macOS, and Linux versions are release-blocking? | M0 | adamlow-wire | All three platforms remain in scope; minimum supported OS versions are fixed under PKG-001 before release qualification |
| Q-002 | Which identity providers and federation variants form the mandatory SSO matrix? | TST-002 | adamlow-wire | Automate protocol behavior with deterministic fixtures; record real-provider evidence when available without making an undocumented vendor list an M0 dependency |
| Q-003 | Can the Wire webapp accept a versioned `contextBridge` adapter, and where should that adapter live? | ARC-001 | Desktop/webapp | TBD |
| Q-004 | Which account state must migrate, and which caches may be safely rebuilt? | PKG-003 | Product/security | TBD |
| Q-005 | Which certificate interception/bypass behavior remains a product requirement? | CAP-005 | Security/product | TBD |
| Q-006 | Is Linux feature parity equal to Windows/macOS or a defined subset? | BASE-002 | adamlow-wire | Retain the current capability scope on Linux; document unavoidable platform differences explicitly and test them under their owning capability |
| Q-007 | What staged rollout and telemetry are permissible for this security-sensitive product? | REL-002 | Product/privacy/security | TBD |
| Q-008 | Who are the accountable technical, security, product, platform, SSO, and release-engineering approvers? | M0 | adamlow-wire | `adamlow-wire` is the accountable solo maintainer for each role; PR merges record self-review, not independent review |
| Q-009 | Which existing Wire CI credentials and runners may be provisioned to the fork for E2E, signing, and package evidence? | M0 | adamlow-wire | Raw E2E values use private `E2E_WEBAPP_URL`, `E2E_BACKEND_URL`, and `E2E_BACKEND_BASIC_AUTH` Actions secrets; unsigned development macOS testing is valid before release qualification; signing is deferred to M5; Jira is not used by the fork |

## 17. Change log

| Revision | Date | Author | Change | Affected IDs |
| --- | --- | --- | --- | --- |
| 0.6.1 | 2026-08-18 | Codex | Added the raw-value fork E2E credential path and recorded deletion of the temporary bootstrap archive | GOV-001, BASE-001, Q-009 |
| 0.6.0 | 2026-08-18 | Codex | Replaced unavailable multi-person approval assumptions with a truthful solo-maintainer model and reconstructed M0 as a PR-only integration change | GOV-001, BASE-001, BASE-002, ARC-001, SEC-001, RSK-013, DEC-006, Q-001, Q-002, Q-006, Q-008, Q-009 |
| 0.5.0 | 2026-08-18 | Codex | Recorded verified integration-branch protection and corrected diff-coverage sensitivity evidence | GOV-001, TST-001 |
| 0.4.0 | 2026-08-18 | Codex | Captured M0 evidence, corrected SSO characterization versus target-security scope, and recorded external M0 blockers | GOV-001, BASE-001, BASE-002, ARC-001, SEC-001, ELC-001, TST-001, TST-002, CAP-002, RSK-012, RSK-013 |
| 0.3.0 | 2026-08-18 | Codex | Recorded the durable human/AI project-memory outcome and knowledge-concentration risk | OBJ-007, GOV-003, RSK-011 |
| 0.2.0 | 2026-08-18 | Codex | Moved the plan into the durable project documentation hub and added baseline-first testing and AI/human continuity scaffolding | GOV-001, BASE-001, BASE-002, TST-001, TST-002, TST-004 |
| 0.1.0 | 2026-08-18 | Codex | Initial structured modernization plan | all |

## 18. Work item update template

Use this exact structure when adding work. Replace placeholders and add the item to the appropriate subsection of section 10.

```markdown
#### AREA-NNN — Short imperative title

- Priority: `P0|P1|P2|P3`
- Status: `proposed|ready|in_progress|blocked|done|superseded|cancelled`
- Milestone: `M0|M1|M2|M3|M4|M5|M6`
- Dependencies: comma-separated IDs or `none`
- Scope: One bounded outcome.
- Acceptance:
  - Observable, testable condition.
  - Observable, testable condition.
- Evidence: PR, test run, report, ADR, or `TBD`
```

When changing scope, append a change-log row and use this summary in the modifying PR:

```yaml
scope_change:
  reason: <why the change is needed>
  added: [<IDs>]
  changed: [<IDs>]
  superseded: [<IDs>]
  cancelled: [<IDs>]
  priority_changes: [<ID old->new>]
  milestone_impact: <none or description>
  security_impact: <none or description>
  approved_by: [<owners>]
```
