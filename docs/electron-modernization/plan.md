---
document_id: WIRE-DESKTOP-ELECTRON-MODERNIZATION
title: Wire Desktop Electron Modernization Plan
revision: 1.5.90
status: draft
updated: 2026-09-23
owners:
  technical: adamlow-wire
  security: adamlow-wire
  product: adamlow-wire
operating_model: solo AI-assisted maintainer
source_branch: integration/electron-modernization
upstream_base: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
current_electron: 43.4.0
reference_latest_stable_electron: 44.0.0
reference_latest_checked: 2026-08-26
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
| Electron | `43.4.0`; latest stable verified 2026-08-20 | Keep the runtime within Electron's supported window. |
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

- **Track A — Runtime:** Test the direct upgrade to latest stable first; split only at evidenced compatibility boundaries.
- **Track B — Secure shell:** Build the replacement view, preload, IPC, navigation, and permission architecture.
- **Track C — Safety net:** Add characterization, security-contract, and compatibility tests needed to change behavior safely.

The project critical path is:

```text
M0 governance and reproducible baseline
  -> M1 current Electron runtime builds and passes baseline tests
  -> M2 secure single-account shell proves all security invariants
  -> M3 multi-account and security-sensitive capabilities migrate
  -> M4 remaining platform parity, unsigned packages and internal quality/test audit
  -> review handoff to Wire (explicitly not release-qualified)
  -> M5 packaged release qualification and external security review
  -> M6 final upstream PR and controlled rollout
```

An Electron upgrade alone does not complete the security project. Conversely, the replacement shell MUST NOT ship on an end-of-life Electron release.

### M3 execution checkpoints

M3 work remains one primary work item per PR, but validation is organized around coherent security outcomes rather than one hosted E2E cycle per mechanical channel migration:

1. **IPC completion:** migrate the remaining SSO, auxiliary-window, and proxy-prompt renderer-to-main operations; explicitly resolve dormant privileged listeners.
2. **Production secure-shell cutover:** remove remote access, isolate bridges, enable sandboxing, replace product `<webview>` account rendering, move local content off `file://`, and complete production account routing.
3. **Boundary policy:** complete navigation/window-open, permission, renderer-initiated fetch, and deep/external-link policy.
4. **Critical capability parity:** complete SSO, enterprise network/configuration, and deep-link/single-instance behavior on the new boundary.
5. **M3 closure:** audit every M3 acceptance criterion and run the complete cross-platform package and authenticated E2E gate.

Each PR still requires its focused tests and protected-branch checks. Authenticated cross-platform E2E runs at behavior-changing PRs and the checkpoints above; schema-only migrations may rely on the next checkpoint when the deferred platform gap is explicit.

### Current goal: close mandatory unsigned review-handoff work

The maintainer confirmed this as the current goal on September 22. Completion means a **review-ready unsigned engineering handoff**, not merely making the unfinished candidate available for feedback. Use existing work items; unrelated cleanup, UI changes, new features and architectural redesign without an evidenced defect are outside this goal.

All of the following are mandatory before accepting the handoff:

| Gate | Existing owners | Required evidence |
| --- | --- | --- |
| Aggregate test and type integration | PKG-001, TST-005 | Correct Jest/Mocha ownership and passing root and dedicated type checks, without omitting tooling tests. |
| Confirmed security, data-loss and packaging findings | TST-006 and existing CAP/SEC/PKG owners | Reviewed, sensitivity-tested and integrated fixes for diagnostics, settings recovery, resource bounds, package inputs, failure propagation and fuse/signing order; no unresolved high/critical or known security/data-loss finding. |
| Ciphertext ownership and profile compatibility | SEC-003, PKG-003, DCP-016 | Explicit existing-profile or fresh-profile-only decision and an implemented, tested contract; no silent data loss or cross-account decryption authority. |
| Shipped-dependency qualification | ELC-003 | Actual shipped graph reviewed, necessary compatible remediation tested, and no unaccepted high/critical finding. |
| Internal review and test evidence | TST-006 | Completed module, capability/invariant, provenance and coverage ledgers; meaningful tests for reachable automatable paths and specific reviewed dispositions for residual gaps. |
| Final composed platform qualification | PKG-001, TST-005 | Required build/type/lint/analysis, native, authenticated E2E/report and actual unsigned artifact checks pass on the final composed Windows/macOS/Linux candidate; outstanding failures are investigated, not hidden by retries. |
| Reproducible handoff | PKG-001, TST-005, TST-006, GOV-002 | Exact source/artifact identity and hashes, build/test/setup instructions, durable CI evidence, known limitations and runnable external QA procedures with intended owners. |

Actual credentialed signing/notarization and post-sign verification, signed updates, released-installation migration/rollback, live SSO/E2EI, remaining real OS/hardware qualification, independent security review and release-time Electron currency remain mandatory later release qualifications. They are not unsigned-handoff prerequisites or optional release work. Deterministic failure/order/migration tests and downstream procedures remain required now. No security invariant or existing acceptance criterion is waived.

Follow [quality-review.md](quality-review.md): establish the full change/behavior ledger under TST-006, close reachable coverage and quality findings through their existing owners, resolve ELC-003, complete unsigned PKG-001 and packaged TST-005, then re-review and qualify the composed candidate. Prepare Wire review material under GOV-002; do not publish upstream or contact Wire without explicit authorization. A review handoff may precede M5, but no production release, signed-update or customer E2EI compatibility claim may do so. Keep Electron 43.4.0 for this goal; later release currency remains ELC-004.

Signing validation is transferred in scheduling/ownership, not waived: Wire is the intended executor after review, with an individual/access still to be arranged. No signing credentials are required to complete the unsigned handoff. INV-009 and all other invariants remain unchanged. Installer/migration fixtures that can be exercised safely without signing should be prepared and run under PKG-002/PKG-003; those M5 items remain open for their full released-installation and signed-platform matrix.

## 9. Milestones and gates

| Milestone | Exit gate | Mandatory evidence |
| --- | --- | --- |
| M0 — Governed baseline | Fork, PR-only integration branch, accountable maintainer, CI baseline, capability inventory, and threat model exist | Branch/PR links, baseline report, maintainer-reviewed threat model |
| M1 — Supported runtime | Latest stable Electron builds and baseline tests pass on supported platforms | Version check, breaking-change log, CI runs, packaged smoke results |
| M2 — Secure shell proof | One opt-in account runs using the new architecture and proves INV-001 through INV-008 and INV-010; production package integrity remains owned by INV-009/M5 | Architecture tests, hostile-renderer tests, IPC/policy tests, security review notes |
| M3 — Security-critical parity | Multi-account, SSO, certificate, navigation, permissions, and deep links use the new boundary | Capability tests and platform E2E evidence |
| M4 — Full required parity and review handoff | Retained functional capabilities, unsigned PKG-001/TST-005 and internal TST-006 audit pass; external qualification gaps are explicit | Capability/coverage ledger, internal review and remediation, all-platform unsigned artifacts and final-head CI |
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
- Status: `in_progress`
- Milestone: `M2`
- Dependencies: GOV-001, ARC-001
- Scope: Open a non-mergeable draft PR or upstream design discussion once the architecture skeleton is demonstrable.
- Acceptance:
  - Upstream can review the architecture before full migration cost is incurred.
  - Material feedback is represented as decisions, risks, or work-item changes here.
- Evidence: TBD; fork PR #8 is CAP-001 implementation evidence, not an upstream architecture draft

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
- Status: `done`
- Milestone: `M0`
- Dependencies: GOV-001
- Scope: Record current build/test results, supported platforms, package outputs, startup behavior, and known failures without treating known insecure behavior as desired behavior.
- Acceptance:
  - Unit, renderer, build-tool, and available E2E results are recorded.
  - Packaging is attempted on Windows, macOS, and Linux; produced artifacts are smoke-tested, while failures to produce an artifact are retained and assigned to an owning work item.
  - Known flaky or environment-dependent tests are identified.
  - Baseline artifacts and logs are retained by CI.
- Evidence: [Legacy baseline and known gaps](./baseline.md); [PR #1 package run](https://github.com/adamlow-wire/wire-desktop/actions/runs/32187255739) retained passing Windows/macOS artifacts and a reproducible Linux failure; [PR #3 E2E run 32364188026](https://github.com/adamlow-wire/wire-desktop/actions/runs/32364188026) passed Windows and macOS with all group-call and logout cases passing on their first attempts; the merged report retained 57 expected results and three unrelated known flakes

#### BASE-002 — Create the capability acceptance matrix

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: BASE-001
- Scope: For every `retain`, `retain/redesign`, or `retain/harden` scope entry, record supported platforms, current behavior, desired behavior, tests, migration owner, and acceptance evidence.
- Acceptance:
  - Every retained scope entry maps to at least one capability row.
  - Each row identifies automated, packaged-smoke, and manual validation requirements.
  - Product and security owners approve security-sensitive behavior.
- Evidence: [Capability and acceptance matrix](./capabilities.md); the solo maintainer merged [PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1), recording acceptance

### 10.2 Architecture and security

#### ARC-001 — Approve target process and view architecture

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: SEC-001
- Scope: Produce an ADR covering the main process, local shell, `WebContentsView` account views, view ownership, session partitions, preload boundaries, and layout coordination.
- Acceptance:
  - The ADR explains why `<webview>` is removed or documents an approved exception.
  - Trust boundaries and data flows are diagrammed.
  - Account creation, destruction, crash recovery, focus, resize, and lifecycle are specified.
  - Security and platform owners approve the ADR.
- Evidence: [Accepted ADR 0001](./decisions/0001-process-and-view-architecture.md); the solo maintainer reviewed and accepted it by merging [PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1)

#### ARC-002 — Implement the secure single-account shell proof

- Priority: `P0`
- Status: `done`
- Milestone: `M2`
- Dependencies: ARC-001, ELC-002
- Scope: Add an explicit opt-in path that runs one remote account in a main-owned `WebContentsView` behind a sandboxed local shell, without enabling legacy remote or broad IPC authority on that path. This proves the boundary before product-capability migration; it does not remove the legacy fallback.
- Acceptance:
  - The proof uses a privileged local scheme with a restrictive production CSP, plus a remote view with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and `webviewTag: false`.
  - A main-owned immutable identity registry binds the view, main frame, exact origin, isolated persistent session, and a minimal capability set before remote navigation.
  - The only proof IPC is a fixed, versioned, runtime-validated contract; unknown, destroyed, subframe, origin-mismatched, or invalid-payload callers fail closed.
  - Navigation, popup, permission, and download behavior default to deny and have positive and hostile tests where an allow path exists.
  - Real Electron integration tests prove effective preferences, the absence of Node/Electron/raw IPC/remote access, session isolation, lifecycle cleanup, and authority removal before crash recovery.
  - Legacy product E2E and Windows/macOS/Linux package baselines remain green because the proof path is opt-in.
  - Proof evidence maps INV-001 through INV-008 and INV-010. INV-009 remains owned by SEC-011 and M5 production qualification.
- Evidence: [PR #7](https://github.com/adamlow-wire/wire-desktop/pull/7); [Windows/macOS/Linux secure-shell and package baseline](https://github.com/adamlow-wire/wire-desktop/actions/runs/32469363410); [authenticated Windows/macOS E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/32469363449) passed with 55 first-attempt passes, 5 disclosed retry passes, and 0 unexpected failures; changed-code coverage passed at 80.00% statements and 95.45% security branches in [Build and Test](https://github.com/adamlow-wire/wire-desktop/actions/runs/32469363415)

#### SEC-001 — Threat model the desktop wrapper

- Priority: `P0`
- Status: `done`
- Milestone: `M0`
- Dependencies: BASE-002
- Scope: Model remote webapp compromise, malicious navigation, compromised dependencies, hostile local environment, cross-account attacks, malicious deep links, SSRF, updater abuse, and renderer-to-main escalation.
- Acceptance:
  - Assets, trust boundaries, entry points, attackers, and mitigations are documented.
  - Each high-risk threat maps to an invariant and work item.
  - Residual risks have named owners and acceptance authority.
- Evidence: [Accepted desktop wrapper threat model](./threat-model.md); the solo maintainer reviewed and accepted it by merging [PR #1](https://github.com/adamlow-wire/wire-desktop/pull/1)

#### SEC-002 — Create a central view identity and capability registry

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: ARC-001
- Scope: Bind every `WebContents` and frame to a known view type, account identifier where applicable, allowed origins, session, and capability set.
- Acceptance:
  - Unknown, destroyed, unexpected-frame, and origin-mismatched senders fail closed.
  - Identity cannot be supplied or overridden by renderer payload data.
  - Unit and integration tests cover authorized and unauthorized senders.
- Evidence: [PR #13](https://github.com/adamlow-wire/wire-desktop/pull/13) merged as `0281c134` after build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and merged reports passed. It binds the application shells, legacy and secure account views, About, proxy prompt, SSO, picture-in-picture, and WebRTC-internals window to immutable central authority. The clean full coverage gate passed with 183 Electron main tests plus 3 owned CAP-002 targets pending, 85/106 changed statements (80.19%), and 41/41 changed security branches (100%). Picture-in-picture rejection and developer-tool authority registrations were sensitivity-proven with temporary perturbations that were reverted.

#### SEC-003 — Introduce typed, validated, capability-specific IPC

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M3`
- Dependencies: SEC-002
- Scope: Replace ad hoc main/renderer IPC with a narrow versioned contract and runtime payload schemas.
- Acceptance:
  - No bridge exposes raw `send`, `invoke`, `on`, Electron event objects, or arbitrary channel names.
  - Every privileged channel declares permitted view types, origins, request schema, response schema, and failure behavior.
  - Every privileged channel has positive, unauthorized-sender, and invalid-payload tests.
  - Payload size and rate limits exist where abuse could consume material resources. Pending native operations are also bounded independently of quota windows, and limiter state does not retain destroyed views for the binder lifetime.
- Evidence: [PRs #14–32](https://github.com/adamlow-wire/wire-desktop/pulls?q=is%3Apr+is%3Amerged+base%3Aintegration%2Felectron-modernization) established the contract executor and migrated every inventoried privileged renderer-to-main operation. Each merged slice passed focused allow/deny tests, changed-code coverage, required CI, and all-platform packaging; [PR #31](https://github.com/adamlow-wire/wire-desktop/pull/31) additionally passed authenticated Windows/macOS E2E after one evidence-based rerun. [PR #32](https://github.com/adamlow-wire/wire-desktop/pull/32) merged as `661e616a` after every required check passed; it replaced the internal About event with a direct main-owned call, removed the unproduced updater listener, and closed the production-source audit with no raw privileged incoming listener remaining. Later capabilities MAY add narrowly authorized contracts with the same SEC-003 controls, as SEC-004 does for the SSO account-limit warning.

- TST-006 follow-up: baseline `3bb1e04e` preserves quotas/identity behavior (11 passes) and exposes pending-save retention (one failure). Current local F-003/F-011 remedy uses weak webContents keys and one active application-owned native picture save, with capacity released on every settlement. Native/composed qualification and the separate DCP-016/F-012 ownership decision remain open.

#### SEC-004 — Remove `@electron/remote`

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-003
- Scope: Replace `nativeTheme` and context-menu use of remote APIs with explicit main-process capabilities.
- Acceptance:
  - `@electron/remote` is absent from production dependencies and source.
  - No `remoteMain.initialize` or `remoteMain.enable` remains.
  - Theme and context-menu behavior pass their capability tests.
- Evidence: [PR #33](https://github.com/adamlow-wire/wire-desktop/pull/33) merged as `f8c72360`. It characterizes context-menu selection and moves native menu construction, edit commands, spelling replacement, and theme observation into the main process. Immutable encoded locale/user-data bootstrap values replace renderer `remote.app` reads; an application-shell-only, payload-free, rate-limited contract replaces the automated-SSO warning dialog. `@electron/remote`, `remoteMain.initialize`, and `remoteMain.enable` are absent from production source, dependencies, and the lockfile. The clean local suite passed with Jest 19/19 suites and 63/63 tests, Electron main 315 passing plus 3 owned CAP-002 targets pending, renderer 4/4, build tools 35/35, and 116/143 changed statements (81.12%). Context action, theme update, runtime-argument decoding, SSO payload-denial, and startup-locale assertions were sensitivity-proven. Initial hosted Linux/macOS package smoke exposed an unavailable pre-ready Electron locale; its deterministic fallback passed the exact package smoke path on all platforms. The corrected head passed build/test, lint, CodeQL, [Windows/macOS/Linux package baselines](https://github.com/adamlow-wire/wire-desktop/actions/runs/33858307288), [authenticated Windows/macOS E2E and merged reports](https://github.com/adamlow-wire/wire-desktop/actions/runs/33858307298).

#### SEC-005 — Replace preloads with isolated bridges

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-003
- Scope: Use `contextBridge` to expose immutable, capability-specific APIs to the local shell and remote account content.
- Acceptance:
  - `contextIsolation: true` is enforced for every renderer.
  - Preloads do not mutate shared `window`/`global` state outside reviewed bridge exposure.
  - Bridge values and callbacks do not leak Electron event objects or privileged closures.
  - Bridge compatibility with the Wire webapp is versioned and tested.
- Evidence: [PR #35](https://github.com/adamlow-wire/wire-desktop/pull/35) merged as `d9f4f78b`. Real-Electron tests enforce context isolation and immutable named bridges with no Node, Electron, generic IPC, or event-object exposure to remote content. Fixed main-world adapters preserve the webapp API and account/menu event routing. Sensitivity checks covered bridge API removal, account misrouting, missing loaded subscriptions, SSO control swaps, and disabled isolation; startup locale reassignment and isolated-world webview dispatch regressions were reproduced and corrected. [Build/test](https://github.com/adamlow-wire/wire-desktop/actions/runs/34122411167) passed with 190/233 changed statements (81.55%); [all-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34122411362) and [authenticated Windows/macOS E2E plus reports](https://github.com/adamlow-wire/wire-desktop/actions/runs/34122411227) passed. Windows required one unchanged failed-job rerun after a multi-account notification timeout; registration/login flakes were also disclosed. Sandboxing and removal of product webviews remain SEC-006/SEC-007.

#### SEC-006 — Enable renderer sandboxing everywhere

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-005
- Scope: Enable application-wide sandboxing with explicitly justified exceptions only if unavoidable.
- Boundary contract: Bundle preloads without Node filesystem/module-loading dependencies. Main owns selected environment and locale bootstrap; remote `environment` retains read-only metadata and lookup methods, not the accidentally exported settings mutator or main-process diagnostic/policy helpers. Image copy uses the clicked account's native `copyImageAt`; save-image fetching remains in the account session. Preload diagnostics use the console rather than direct filesystem writes.
- Acceptance:
  - Remote and local renderers run sandboxed in development and packaged builds.
  - `nodeIntegration` and `nodeIntegrationInWorker` remain disabled.
  - CI asserts effective `webPreferences` for every window/view type.
  - Any exception has a time limit, owner, threat analysis, and removal work item.
- Evidence: [PR #37](https://github.com/adamlow-wire/wire-desktop/pull/37) merged as `5926e3d0` after final-head [build/test and coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34212873450), [all-platform package baselines](https://github.com/adamlow-wire/wire-desktop/actions/runs/34212873453), and [authenticated Windows/macOS E2E plus reports](https://github.com/adamlow-wire/wire-desktop/actions/runs/34212873692) passed. Preloads are browser-target bundles; application-wide sandboxing precedes configuration/main-process startup. Effective preferences, a real renderer Worker, and explicitly OS-sandboxed product/E2E probes confirm isolation and absence of page Node access. Startup order, locale selection, environment restoration, and disabled sandbox mutations failed their intended tests and were reverted. No runtime upgrade or product sandbox exception was introduced.

#### SEC-007 — Replace `<webview>` account rendering

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: ARC-001, SEC-005, SEC-006
- Scope: Implement account content with main-process-owned `WebContentsView` instances and preserve isolated persistent sessions.
- Acceptance:
  - `webviewTag` is disabled and application source contains no `<webview>` element.
  - No `allowpopups` behavior remains.
  - Account views resize, focus, hide/show, crash, reload, add, remove, and switch correctly.
  - Session-isolation tests prove accounts cannot observe each other's storage/cookies.
- Evidence: [PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47) merged as `683ac9af672168d48c9154c47f3dc99a2bdd5d66` after reviewed head `78231f74` passed [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701006), lint/analysis, [Windows/macOS/Linux native/package gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701114), and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34834177940). Both platforms complete all forty cases with 39 initial passes and one login retry; no skips or worker-teardown errors. No unresolved review threads or security exception. Source audit confirms no production `<webview>`, `allowpopups` or enabled webview tag. Native lifecycle tests cover resize/focus/hide/show/recovery/reload/add/remove/switch and cross-account cookie/storage isolation on supported platforms.

#### SEC-008 — Centralize navigation and window-open policy

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-002
- Scope: Enforce allowed origins, navigation types, external destinations, SSO windows, PiP windows, and denial behavior.
- Boundary contract: Account navigation and redirects remain on the main-registered exact HTTP(S) origin; malformed, credential-bearing, opaque, and scheme-confused URLs fail closed. Popups require the actual main-owned source URL to match the registered account origin. Referrers are optional supplementary evidence, not identity: staging serves `Referrer-Policy: same-origin`, which suppresses referrers for legitimate blank PiP and cross-origin SSO windows. Any nonempty foreign referrer is denied, but an empty referrer is permitted only with the main-owned source origin and the fixed destination/window policy. PiP retains the required empty/about:blank and same-origin flows with secure preferences and account-session isolation. SSO is created by main in its isolated session, not by accepting a renderer-created child whose session override is ineffective; `window.open` returns null, while existing desktop close/focus/result events remain the control path. SSO permits HTTPS IdP navigation, the initial origin for existing local HTTP fixtures, and its exact bounded callback scheme/host. Reload, crash, or destruction of the initiating view closes its SSO window. Auxiliary resources have explicit cancellation; developer windows deny new windows. The shared external parser preserves HTTP(S), FTP, and bounded mailto while excluding app-protocol recursion, credentials, controls, backslashes, and oversized input. SEC-013 retains incoming deep-link parsing and lifecycle routing; reuse its existing parser work rather than creating an overlapping task.
- Execution: PR #39 supplies strict incoming parsing independently; PR #38 consumes it to preserve approved app-protocol links through main-owned dispatch, never OS recursion. Source-origin authorization preserves ordinary `noreferrer` links. Existing selected-account deep-link routing remains CAP-001/CAP-006 scope. Require both PRs' final gates before integration closure.
- Acceptance:
  - Unexpected navigation is prevented, not merely logged.
  - New windows default to deny.
  - Allowed SSO/PiP windows use fixed reviewed preferences.
  - External URLs use protocol and origin policy with adversarial tests.
- Evidence: Local baseline 31 passing / 3 owned CAP-002 targets pending. Real navigation/redirect cancellation and origin-policy mutations failed as intended and were restored. New targets reproduced SSO session inheritance, missing SSO redirect/transport denial, hung About requests, the proxy stylesheet redirect, permissive developer popups, and ambiguous external URL dispatch. PR #38 merged as `67dfb5db` after final-head build, analysis, all-platform packages and authenticated Windows/macOS E2E/report passed; the custom-backend cutover gate below remains open.
- SSO lifecycle refinement: reserve the single active flow before asynchronous initialization and retain it until cleanup completes. Repeated requests from its owner focus it; requests from another account cannot replace or control it. Close and native closed events share one captured-session cleanup operation; a new target reproduced a duplicate-cleanup `undefined.protocol` error. Failed cleanup does not mark the session reusable. CAP-002 still owns one-time callback validation, cookie scope, and full IdP acceptance.
- Cutover acceptance: [PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47) integrates main-owned destination approval with exact owning-view replacement, preserved partitions, saved-destination denial and invalid approval-result rejection. [PR #49](https://github.com/adamlow-wire/wire-desktop/pull/49) integrates unreadable machine-policy denial as4f04a8a0. Final head66f9d9db passes [all-platform native/package gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34848889664), including real Windows registry guard-removal failure/restoration and combined account/navigation/popup/SSO/PiP/external policy targets, plus build/lint/analysis and [authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34848889715),43 initial passes per platform without skips or retries. Programmatic navigation cannot bypass main-owned policy; all four SEC-008 acceptance criteria are satisfied. Live identity-provider acceptance remains CAP-002, not a waiver of navigation enforcement.

#### SEC-009 — Centralize permission policy

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-002, SEC-003
- Scope: Implement request and check handlers for camera, microphone, notifications, display media, and any device permissions.
- Desktop-source contract: Enumeration returns screen/window thumbnails and is itself privileged capture. Production accounts must not receive the enumeration capability until main-owned source consent is enforced; camera/microphone consent never authorizes it. The September 14 product regression intercepts native enumeration without capturing the host and reproduces one unapproved call before the capability is removed. Display enabling/source selection remains CAP-003/M4; M3 permission enforcement retains capture and thumbnail denial. No acceptance criterion is changed.
- Acceptance:
  - Permissions default to deny.
  - Grants bind permission type to authorized origin, view, account, and user flow.
  - Main-frame and subframe behavior is defined.
  - Allowed and denied cases are tested on supported platforms.
- Evidence: [PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47) merged as `683ac9af672168d48c9154c47f3dc99a2bdd5d66` after reviewed head `78231f74` passed [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701006), lint/analysis, [Windows/macOS/Linux native/package gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701114), and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34834177940). Both platforms complete all forty cases with 39 initial passes and one login retry; no skips or worker-teardown errors. No unresolved review threads or security exception. Reviewed dependency #48 supplies separately scoped notification/audio/video consent, foreground/document revalidation, cancellation/revocation and subframe/unknown denial. Native dialog cancellation and synthetic-device allow/deny pass on all three platforms; real product permission and authenticated calling flows pass. Device grants do not authorize capture or thumbnails. DEC-009 is accepted for this M3 policy; enabling display remains CAP-003/M4.

#### SEC-010 — Replace `file://` shell loading and tighten CSP

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: ARC-001
- Scope: Serve packaged local content through a privileged custom scheme and remove production `unsafe-eval`.
- Protocol cutover: [accepted DEC-010](./decisions/0003-local-content-protocol.md) serves seven fixed role-specific assets on `wire-app`, GET/HEAD only, with exact document identities and unchanged account sessions. Only standard/secure scheme privileges are enabled. The conditional migration-only file-origin reader stays script-disabled; ordinary content uses the scheme. Existing baselines protect relative resources, legacy import and production/development CSP denial.
- Integration: [PR #50](https://github.com/adamlow-wire/wire-desktop/pull/50) merged as `18235a5a646d24ee936d040d7a400980f912ee98`. Its tree equals reviewed head4f867021; normal shell/About/proxy content uses the finite custom scheme, while only the conditional script-disabled migration reader touches the former file origin.
- Execution: remove `unsafe-eval` independently, with actual production/development shell startup and ordinary-script denial tests; development source maps must not require a relaxed policy. Keep the current storage origin in this slice. The subsequent custom-scheme cutover must preserve legacy account state and session mappings; the CAP-001 persistence fixture supplies that regression gate. This slice does not close SEC-010 until local content no longer depends on `file://`.
- Acceptance:
  - Local application content does not depend on `file://`.
  - Production CSP does not include `unsafe-eval`.
  - Custom protocol privileges are minimal and tested.
  - Development-only relaxations cannot reach production builds.
- Evidence: CSP slice [PR #42](https://github.com/adamlow-wire/wire-desktop/pull/42) merged as `9c188bf1` after build, lint, analysis, [all-platform packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374305) and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34321374718) passed naturally. Production/development startup and ordinary-script eval/Function denial are tested with sensitivity evidence. That earlier slice left custom protocol and storage migration open; the final acceptance below closes both.

- Final acceptance: head4f867021 passes [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857405276), [lint](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857405311), [analysis](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857405296), [all-platform native/package qualification](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857405317), and [authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857460712). All43 cases complete per platform: macOS43 initial; Windows41 initial/two retry passes, no skips or worker errors. One unchanged-head Windows native retry follows an initial fixture setup timeout; both attempts are retained. Substantive fixed-path/session/privilege/CSP/migration review and strict current-base checks precede merge. All four SEC-010 acceptance criteria are met; DEC-010 is accepted.

#### SEC-011 — Harden Electron fuses and package integrity

- Priority: `P0`
- Status: `proposed`
- Milestone: `M5`
- Dependencies: ELC-002, PKG-001
- Scope: Review all target-version fuses, preserve existing protections, and enable ASAR integrity/only-load-from-ASAR where correctly supported.
- Acceptance:
  - A documented fuse manifest exists for every platform package.
  - CI verifies effective fuse values in packaged binaries.
  - Integrity settings and code-signing order are compatible, verified on actual signed artifacts by Wire after engineering review; unsigned CI or source inspection cannot close this criterion.
  - Development packages cannot be confused with production artifacts.
- Evidence: TBD

#### SEC-012 — Harden renderer-initiated network fetches

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-003
- Scope: Review or replace Open Graph and other main-process network operations for SSRF, redirects, protocols, DNS/IP ranges, response limits, cookies, and timeouts.
- Preview contract: Optional previews use only public HTTP(S) destinations on default ports, reject mixed/private DNS answers, pin validated addresses and revalidate every redirect. No response cookies, account credentials or ambient proxy credentials are replayed. Pages behind private networks, authenticated proxies or cookie challenges may lose previews; ordinary account/backend traffic is unchanged. Enforce a 10-second per-resource deadline, five redirects, 1 MB HTML and 5 MB image wire/decoded limits. Replace the inherited-property-mutating parser with an HTML tokenizer that collects only known preview fields, preserves title/image fallbacks and entities, and bounds tags, fields and field length. Arbitrary metadata object paths and unused audio/video trees are not part of the retained webapp preview contract.
- Closure: PR #44 merged as `62435cc6` after head `9bac19b2` passed [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34333303038), lint, analysis, [Windows/macOS/Linux packages](https://github.com/adamlow-wire/wire-desktop/actions/runs/34333303096) and [Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34333303173). No unresolved review threads or security exception. Earlier failed macOS fixture runs are retained as diagnosis evidence; PR #46 repaired the seed-only teardown without weakening product assertions or production shutdown. CAP-005 retains certificate/configuration/download policy; this closes SEC-012, not M3.
- Acceptance:
  - Only required protocols are accepted.
  - Loopback, link-local, private, metadata-service, and otherwise prohibited destinations are handled by explicit policy.
  - Every redirect target is revalidated.
  - Response byte, time, redirect, and parsing limits are tested.
  - Renderer-controlled fetches do not receive privileged ambient credentials.
- Evidence: Baseline `41882ee3` protects image/text behavior; `b31f4b60` protects metadata, entity, duplicate and fallback behavior. The old implementation fails five private-fetch targets and an inherited-object mutation target. Native pinned-DNS transport and bounded metadata collection pass 528 full main tests, 4 renderer, 94 React and 35 tools. New parser/destination/fetch branch coverage is 96%/95%/92.16%. Deliberate private-address, DNS-pinning and compressed wire-limit regressions fail 22 assertions and are restored. All-platform focused suites and final hosted gates passed in the closure run above. Source inventory finds no other renderer-supplied main-process URL fetch: context-menu image retrieval runs in the account preload/session and passes bounded bytes to main; electron-dl handles browser downloads; updater URLs come from main configuration. Certificate/configuration and download-path policies retain their CAP-005/PKG ownership. `open-graph` and its obsolete `request` dependency tree are removed; type-only bridge declarations remain. The [htmlparser2 10.1.0 manifest](https://raw.githubusercontent.com/fb55/htmlparser2/v10.1.0/package.json) provides the CommonJS entrypoint compatible with the existing build; no claim of adopting its latest major is made. Address policy conservatively follows the [IANA IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry) special-use registries.

#### SEC-013 — Harden deep-link and external-link handling

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-003; SEC-008 for final popup/external closure (incoming parsing is independently executable)
- Scope: Parse custom-protocol and external-link inputs with strict schemas and explicit action routing.
- Acceptance:
  - Happy paths, malformed input, oversized input, encoded-delimiter, protocol-confusion, and recursion cases are tested.
  - Deep links cannot invoke arbitrary IPC or navigation.
  - External links cannot invoke dangerous local protocols.
- Boundary contract: Only bounded recognized user/conversation (including federated and file-list), preferences, meetings, SSO, login and join actions are accepted. Malformed paths, traversal, encoded path delimiters, credentials, ports, fragments, unknown routes, duplicate/unknown parameters and invalid backend domains fail closed. Absent join domain stays null at the existing dispatch boundary. Desktop has no existing access/config route; adding remote backend configuration remains CAP-005 scope.
- Execution split: Publish incoming parsing independently on `sec/SEC-013-incoming-links-2026-09-08`, then reuse it in SEC-008 for safe internal popup routing. Do not close SEC-013 until external-link and lifecycle acceptance is evidenced.
- Evidence: Existing parser work was reconciled without restoring raw IPC. Thirteen baseline dispatch tests pass; destination mutation fails all seven added route tests. Legacy dispatch fails 14/15 new deny cases. Strict parser, dispatch and existing authorized submission checks initially pass 36/36; final full Electron-main run passes 366 with 3 owned CAP-002 targets pending, Jest passes 64/64. PR #39 merged as `75b22ded` after applicable final-head coverage, package and E2E gates; PR #38 supplies validated internal/external popup routing. Account-targeted lifecycle acceptance is now supplied by final PR #51 below. Route contracts were checked against sibling webapp page/appMain.tsx and router/routeGenerator.ts; domains against sibling server libs/types-common/src/Data/Domain.hs.

- Final acceptance: [PR #51](https://github.com/adamlow-wire/wire-desktop/pull/51) merged as `c74d116e` after substantive review of exact head1eaf7fba and successful build/coverage, lint, analysis, all three native/package platforms and authenticated Windows/macOS E2E/report. Existing strict parser/external-link denials and authorized selected-account startup/running dispatch remain intact; actual second-Electron delivery verifies exact routing, zero secondary exit and unchanged account count. [Native34862334704](https://github.com/adamlow-wire/wire-desktop/actions/runs/34862334704) and [E2E/report34862337125](https://github.com/adamlow-wire/wire-desktop/actions/runs/34862337125) provide final platform evidence. macOS43 initial passes; Windows41 initial/two retry passes, no skips or worker errors. No acceptance criterion or security invariant is waived.

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
- Status: `done`
- Milestone: `M1`
- Dependencies: BASE-001, ELC-001
- Scope: Upgrade from Electron 38 to the latest stable release, testing the direct transition first and splitting only where an evidenced compatibility boundary requires it. Refresh the target immediately before completion.
- Acceptance:
  - `package.json` pins the latest stable Electron available at completion.
  - All baseline unit, integration, type, lint, and required E2E tests pass.
  - Packaged apps launch on all supported operating systems.
  - The breaking-change log records every required code/configuration change.
  - No temporary compatibility flag weakens a security invariant without a tracked exception.
- Evidence: [PR #6](https://github.com/adamlow-wire/wire-desktop/pull/6); final-head [package baseline](https://github.com/adamlow-wire/wire-desktop/actions/runs/32463021013) passed on Windows, macOS, and Linux; [authenticated E2E](https://github.com/adamlow-wire/wire-desktop/actions/runs/32463021040) passed with 60 tests, 0 unexpected failures, and 3 disclosed retry passes

#### ELC-003 — Upgrade or replace Electron-adjacent dependencies

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M1`
- Dependencies: ELC-001
- Scope: Upgrade or replace incompatible/deprecated Electron-adjacent packages, prioritizing dependencies in privileged processes and removing abandoned packages.
- Acceptance:
  - Production dependency audit has no unaccepted high/critical finding.
  - Each replacement preserves required behavior with tests.
  - `@electron/remote` removal is handled by SEC-004, not upgraded in place.
- Evidence: local protocol-runtime removal starts with numeric availability characterization in both badge consumers; source inventory and graph limits are recorded in [status.md](status.md). The certificate-check parser is locally resolved to jsrsasign11.1.1 after RSA/EC pinning characterization and sensitivity; fresh installed-graph advisory matches fall from37 to31. Updater redirect/YAML dependencies are locally patched with deny-path and compatibility evidence; installed-graph matches now total25 across axios/Joi/uuid. Axios is locally patched in both tooling versions and removed from production scope after consumer characterization; only Joi low/uuid moderate remain in the installed production audit. Deprecated Joi is now locally migrated to joi17.13.8 with unchanged schemas and40 Node/80 renderer cases; only uuid moderate remains in the installed audit, assessed as not applicable to current v4-only callers. [Actual baseline and corrected unsigned Linux ASAR inventories](shipped-linux-asar-audit.md) are recorded. The two residual Linux installer version matches are [disposed for reviewed call paths](shipped-linux-asar-audit.md#elc-003-residual-advisory-call-path-disposition-on-the-final-linux-graph): `uuid` v3/v5/v6 buffer APIs are not used by first-party callers, and the sole shipped `@tootallnate/once` consumer does not pass `AbortSignal`. These remain unpatched range matches. [First hosted Windows/macOS and second hosted Linux candidate graphs](shipped-linux-asar-audit.md#elc-003-cross-platform-candidate-shipped-graphs-from-draft-pr-63) are now extracted: Windows/macOS have byte-identical 351-instance inventories whose name/version pairs are a subset of the already approved 407-instance Linux query, and the hosted Linux inventory matches that input exactly. Version screening therefore has no unaccepted high/critical match on these observed candidate graphs at the query time; platform-specific and dynamic call paths, advisory freshness, accepted-head composition and native qualification remain open.

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
- Status: `done`
- Milestone: `M0`
- Dependencies: BASE-002
- Scope: Cover SSO window/session lifecycle, protocol validation, authorization secret behavior, cookies, navigation, permissions, cancellation, errors, and cleanup.
- Acceptance:
  - Required legacy behavior has passing characterization tests whose sensitivity is demonstrated before implementation changes.
  - Invalid protocol, host, secret, response type, length, replay, order, cookie scope, and cleanup expectations exist as passing characterization or explicitly quarantined `security-target` tests owned by CAP-002.
  - SSO session creation, permission denial, success/error/cancellation paths, intended cookie transfer, navigation, and close cleanup are exercised without external IdP dependence.
  - At least one representative Electron integration flow uses a controlled test IdP or deterministic local fixture.
- Evidence: commits `c27cfa6a41404f3835049d0553d6fbb7b17c4441` and `6e1fc7f0`: 18 characterization tests pass, including a deterministic local Electron SSO flow with permission denial, success, error, cancellation, cookie transfer, navigation, and cleanup; three CAP-002 security targets remain narrowly quarantined; protocol-condition and error-response sensitivity mutations produced the expected failures and were reverted

#### TST-003 — Characterize tray, badge, notification, and menu behavior

- Priority: `P1`
- Status: `done`
- Milestone: `M3`
- Dependencies: BASE-002
- Scope: Extend unit/platform tests for tray clicks, menu actions, zero/nonzero icon transitions, tooltip, app badge, Windows overlay, macOS bounce, and Linux icon variants.
- Acceptance:
  - Platform branches are tested through injectable adapters or platform CI.
  - macOS tests assert `dock.bounce` rather than unconditionally passing.
  - Packaged visible tray/menu/tooltip smoke remains required under CAP-004/PKG-001, outside this characterization gate, consistent with accepted PR #12 and the maintainer’s pre-packaging scope.
- Evidence: [PR #12](https://github.com/adamlow-wire/wire-desktop/pull/12) merged as `37f8b5e3` after build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and the merged report passed. Commit `a0c91987` passes 9/9 focused tray tests and the full Electron main suite (164 passing with 3 owned CAP-002 targets pending). Temporary macOS/non-macOS platform perturbations failed the intended tests and were reverted; visible tray automation remains part of CAP-004's packaged native smoke rather than this characterization gate.

#### TST-004 — Add security-boundary regression tests

- Priority: `P0`
- Status: `done`
- Milestone: `M2`
- Dependencies: ARC-002
- Scope: Assert effective web preferences, bridge surface, sender authorization, navigation policy, popup policy, permissions, session isolation, and fail-closed behavior.
- M3 maintenance (2026-09-09): PR #46 replaces the metadata test's first full-app seed/close, traced as the repeated macOS teardown stall, with an isolated sandboxed, JavaScript-disabled file-origin fixture. All metadata/session/restart assertions are retained. Five local repetitions pass; wrong-storage-key perturbation fails before restoration. Final-head all-platform packages and [Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34329781004) pass; merged as `6f256d59`. macOS has two disclosed multi-account retry passes, not a metadata teardown error. Product shutdown, deadlines, retries and M2 completion status are unchanged.
- Acceptance:
  - Tests fail if context isolation or sandboxing is disabled.
  - Tests fail if Node, Electron, raw IPC, or remote APIs become reachable from remote content.
  - A hostile test page exercises unauthorized IPC and cross-account attempts.
- Evidence: [PR #7](https://github.com/adamlow-wire/wire-desktop/pull/7) adds 17 mandatory `security-target` tests covering effective preferences, bridge reachability, sender authorization, exact-origin navigation, popup/permission/download denial, partition isolation, teardown, and crash recovery; a temporary fail-open navigation mutation produced the expected hostile-origin failure and was reverted; the tests passed on Windows, macOS, and Linux in [run 32469363410](https://github.com/adamlow-wire/wire-desktop/actions/runs/32469363410)

#### TST-005 — Expand platform E2E and packaged smoke CI

- Priority: `P1`
- Status: `in_progress`
- Milestone: `M4`
- Dependencies: BASE-001, PKG-001
- Scope: Add Linux coverage, make mandatory modernization checks non-optional, and distinguish development-mode E2E from packaged-app smoke tests.
- Acceptance:
  - Required integration-branch checks run on Windows, macOS, and Linux.
  - Security-critical smoke tests execute packaged artifacts.
  - Test artifacts, logs, screenshots, and traces are retained on failure.
  - Flaky tests have owners and bounded quarantine rules.
- Evidence: The functional development/test foundation is integrated through reviewed [PR #58](https://github.com/adamlow-wire/wire-desktop/pull/58), merge `6930c8ce`. All final-head core/native and 69-case Windows/macOS/Linux E2E/report gates pass, with retained bounded retries in status/PR evidence. All ten integration checks are strict and mandatory after protection readback. The [functional M4 audit](m4-acceptance.md) accepts the composed development scope at 41066868 after all 76 E2E cases/platform and core/native/report checks pass. Separate sensitive baselines protect safe registration diagnostics, independent account identities and native Quit inspector-reply handling; the notification fixture establishes its unread-conversation precondition without weakening assertions. Packaged-artifact smoke acceptance remains open under PKG-001; this functional scope does not claim release qualification.

- Eighth PR #63 hosted E2E checkpoint: Windows/Linux pass 76/76 and macOS passes the corrected DCP-007 denial case, but the macOS logout-after-clear-data reauthentication case fails a 120-second first attempt and passes on retry (75 ordinary passes/one flaky). Retained trace `10768841287` shows the other authenticated account page at failure; target-account startup versus page-selector behavior is unresolved. TST-005 must diagnose this retry and require clean final composed qualification; report-job success alone does not close the gate. See [finding](review-findings.md).

- Windows execution correction: the bd8b054c log audit shows the GUI version probe returns a green step before either intended packaged smoke runs. Withdraw that packaged execution claim while retaining executed native tests. Baseline02b9ee05 requires an explicit completion output; the actual log lacks both smoke observations and fails the baseline check. Remove the redundant GUI probe and require the Node driver to complete ordinary managed startup plus authenticated proxy startup under a temporary explicit HKCU policy. Do not assume the hosted device is unenrolled or claim an unmanaged Windows run. Final corrected head adbebedc passed both actual Windows smokes and every protected check, then PR #60 merged as 6e27c614; see [audit](m4-acceptance.md) and current status.

#### TST-006 — Audit integrated implementation quality and test completeness

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M4`
- Dependencies: SEC-001, TST-001, TST-002, TST-003, TST-004
- Scope: Review the entire modernization delta from the recorded pre-modernization baseline, including retained code at changed boundaries. Audit baseline-before-refactor provenance, test effectiveness, full changed-code coverage and production quality. This is an internal integrated review, not REL-001 independent security review. Existing CAP/SEC/ELC/PKG items own their implementation fixes; TST-005 owns platform CI, avoiding duplicate work.
- Acceptance:
  - Every retained DCP capability, INV invariant and privileged IPC operation has a row linking implementation, baseline and implementation commits, actual tests/assertions, sensitivity evidence, platforms, final CI and remaining gaps. Missing historical baselines are disclosed; later regression tests are never relabelled as pre-refactor evidence.
  - Review covers the complete baseline-to-candidate diff and affected integration paths: security authority, concurrency/lifetime, cleanup, data integrity, error handling, compatibility, dependencies, performance/resource bounds and maintainability. Findings record severity, owner, fix and retest; no unresolved critical/high finding or known reachable untested security/data-loss path is accepted for handoff.
  - Coverage denominators, collection and exclusions are audited. Report whole instrumentable production scope, full modernization delta, per-module statements/branches/functions and all security-relevant changed modules, not only the existing security-policy subset. Existing 80%/90% CI floors remain minimums, not completion criteria.
  - Aim for 100% of reachable in-scope behavior and decision paths with meaningful assertions. Add all practical deterministic tests; every residual uncovered path has a specific reviewed disposition, evidence and owner. Reachable automatable gaps are fixed, not waived as inconvenient. Unreachable/generated/third-party and external-environment cases are distinguished; exclusions cannot conceal reachable production behavior.
  - Critical allow/deny, stale/cross-account, failure/recovery, persistence and teardown contracts are sensitivity-proven. Audit mocks, test-only hooks, collection, skip/quarantine, retries and actual CI execution. Unexplained timing failures are investigated and receive explicit bounded follow-up; a rerun alone is not a root-cause resolution.
  - All findings required for handoff are remediated and re-reviewed; the final composed candidate passes all applicable final-head gates. A reproducible test guide, coverage/gap ledger, internal review report and Wire QA handoff are committed with durable evidence and precise claim limits.
- Execution: [Review and test-completeness work plan](quality-review.md). Do not claim this item done from earlier per-PR reviews or test counts.
- Evidence: [Execution ledger](review-findings.md) records verified baseline/full scope, PR61 integration, current coverage/dependency audit and open findings. The [latest inventory reconciliation](inventory-reconciliation.md#latest-appimageruntime-imagedesktop-and-advisory-recomposition) accounts for all 528 original-baseline-to-scoped-candidate paths and partially maps F-021/F-022/F-023 to DCP-005/DCP-020/INV-001. Exact source/provenance/coverage placeholders remain 296/317/328 plus populated partial rows. Complete module and DCP/INV/IPC review, final-head re-accounting and platform qualification remain pending; this item is not accepted.

### 10.5 Capability migration

#### CAP-001 — Migrate account and multi-account lifecycle

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M3`
- Dependencies: ARC-002, TST-004
- Scope: Migrate account creation, persistent partitions, add/switch/remove, logout/clear-data, crash recovery, and account-targeted events. This product migration completes the product-wide SEC-007 acceptance that the bounded ARC-002 proof intentionally did not claim.
- Managed destination boundary (reconciled September 14): machine-enforced HTTPS configuration constrains saved account destinations and explicit environment-change approval to its canonical origin. Same-origin paths/query/SSO routes remain compatible. Invalid configured policy or a foreign saved destination fails before navigation; a foreign environment request fails before prompting or profile mutation. Preserve saved account records rather than rebinding their identity/session. The main-owned policy snapshot is fixed until restart. Native Windows registry-to-navigation qualification remains under CAP-005; final cutover gates remain required.
- Test-harness prerequisite (2026-09-08): real fixture renderer termination avoids host crash-dump delays without changing runtime recovery code or test deadlines. Add an explicit pre-replacement revocation assertion; deliberately delayed revocation must fail it. This test-only slice does not close production account migration. Local forced-crash diagnostics stalled before process-loss notification on WSL; non-dumping termination produced notification at 29 ms and completed recovery at 153 ms.
- Metadata identity prerequisite (2026-09-08): webapp account-info updates must reject desktop-owned identity, session, visibility, lifecycle, badge and arbitrary fields. The existing known metadata fields and separate custom-environment URL update remain compatible. Malformed messages must not throw in the user-ID guard. Characterize targeted reducer updates first and prove the tests detect corruption. This bounded validation does not make production account state main-owned or authorize the remaining programmatic environment-change path; those remain CAP-001/CAP-005 cutover work.
- Final-audit startup correction (September15): retained PR55 macOS retry and a deterministic native fixture show a same-origin client redirect interrupting pending startup resources. The initial native load rejects ERR_ABORTED and the view is incorrectly destroyed. Preserve a fully completed approved replacement document, with bounded waiting, native lifetime/ownership checks and unchanged foreign-navigation denial; do not blindly ignore native aborts. Existing cap/CAP-001-production-accounts-2026-09-09 owns this correction after diagnostic PR55 qualifies.
- Cleanup correction (September15): real queued console writes can recreate account logs after removal. Drain queued writes after closing their native producer, then delete under exclusive log maintenance. Preserve exact-target and symlink checks, surface deletion failures for retry, and retain original write failures for their callers. The correction is accepted through [PR #59](https://github.com/adamlow-wire/wire-desktop/pull/59), merged51d04739 after reviewed7d5c34bb passes all core/native platforms and [48-case E2E/report per platform](https://github.com/adamlow-wire/wire-desktop/actions/runs/34963289067). Baseline e4cac57f and a drain-removal perturbation fail; restoration passes23 focused/925 full native cases. macOS has47 initial/one login retry; Windows46 initial/two post-removal/proxy-readiness retries. No skips, worker errors or ENOTEMPTY failures remain in those runs.
- Acceptance:
  - Approved same-origin startup redirects preserve the owning view; failed, cancelled, stale or foreign replacements cannot become successful startup.
  - Rejected shell-account actions and account-preload events produce fixed operation diagnostics without serializing rejected values, while preserving exact account-event forwarding and action rejection behavior.
  - Existing multi-account critical and regression flows pass.
  - Cross-account session and IPC isolation tests pass.
  - Removal deletes only the selected account's intended data.
- Evidence: [PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47) merged as `683ac9af672168d48c9154c47f3dc99a2bdd5d66` after reviewed head `78231f74` passed [build/coverage](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701006), lint/analysis, [Windows/macOS/Linux native/package gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701114), and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34834177940). Both platforms complete all forty cases with 39 initial passes and one login retry; no skips or worker-teardown errors. No unresolved review threads or security exception. Existing multi-account critical/regression flows, native account/session/IPC isolation, targeted cleanup/retry and cold-restart retention pass. Metadata cannot replace identity or partition. The normal native quit assertion is sensitive to a veto and preserves every storage/restart assertion. Prior #8/#10/#41 baselines remain in history. CAP-005 retains the pre-existing registry/proxy/certificate issues and final enterprise qualification.

- Final startup acceptance: [PR #56](https://github.com/adamlow-wire/wire-desktop/pull/56) merged as `45840fca` with tree equal to reviewed `5c596187`. All native platforms, build/lint/analysis and full 48-case Windows/macOS E2E/report pass. Authorized same-origin replacements finish before startup succeeds; failure, cancellation, stale/foreign ownership and credential-bearing native errors remain denied or sanitized. The [complete M3 acceptance audit](m3-acceptance.md) records source review, sensitive baselines, all acceptance criteria and aggregate validation.

- TST-006 follow-up F-008: reopen for bounded pending lifecycle work behind native environment consent. Baseline `8cd6bd18` fails overload rejection; the local candidate limits active/queued operations to 32, rejects excess without effects and releases capacity after success, cancellation and stale-authority failure. Prior cutover acceptance remains historical evidence; final remediation qualification is pending. See [review ledger](review-findings.md).

- TST-006 follow-up F-013: diagnostic file rotation is insufficient to bound pending work. Preserve per-file ordering, cross-file concurrency, flush-tail snapshots and exclusive account-log deletion while limiting active/queued writes to 256, encoded pending payloads to 1MiB and each UTF-8 entry (including line ending and bounded markers) to 64KiB. Copy admitted path/message values, limit path retention to 32,768 characters and rotation collision lookup to 128 candidates. Overflow is best-effort diagnostic loss with a bounded count on the next admitted entry, never a recursively logged rejection; filesystem failures still reject and release reservations. This explicitly replaces unbounded log admission without changing account authorization. Baselines `aaa7e250` and `cbf24648`, local sensitivity and pending native/composed evidence are in the review ledger.

#### CAP-002 — Migrate enterprise and automated SSO

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M3`
- Dependencies: TST-002, SEC-008, CAP-001
- Scope: Move SSO to the secure view/session/IPC architecture while preserving required identity-provider navigation. Include E2EI enrolment and renewal authentication compatibility explicitly; the webapp/core retain ownership of OIDC, ACME and certificate cryptography. This is distinct from CAP-005 transport certificate verification.
- Acceptance:
  - Authentication-page console content and native exceptions containing URLs, cookies or callback secrets never enter desktop diagnostics. Failures retain fixed bounded messages; tests include enabled logging, malformed callbacks, cleanup/cookie failures, external-opening failures and real Electron failed loads.
  - TST-002 passes against the new implementation.
  - Every CAP-002 `security-target` quarantine in the SSO suite is removed and passes.
  - SSO windows use fixed secure preferences and ephemeral sessions.
  - Account targeting and cookie transfer cannot cross partitions.
  - The real backend verdict is delivered without a renderer opener, with success/error and backend error-label compatibility; synthetic direct finalization alone is insufficient.
  - M3 automated acceptance covers desktop-owned E2EI transport and account/session boundaries using deterministic fixtures. It must include allowed same-origin callback transport and rejected foreign navigation, and reuse sensitive SSO callback/replay/cancellation/account-isolation tests. It does not claim OIDC authentication, ACME issuance or verified-device state.
  - Deterministic desktop tests cover cancellation, provider/backend failure and invalid or foreign-account callbacks where desktop owns the behavior. No arbitrary cross-origin account navigation or privileged bridge authority is added for IdP pages. Real enrolment, renewal/silent-auth fallback and retained verified-device state remain mandatory downstream QA checks.
  - Deterministic desktop boundary tests run against the refactored application with final supported-platform CI evidence. The live Keycloak/SSO/E2EI checkpoint is handed to QA using `qa-sso-e2ei.md`; it is not an M3 completion gate after the maintainer-approved September 14 scope revision. Customer E2EI compatibility remains unqualified until QA records those results; a missing live environment is never a skipped pass.
- Evidence: The isolated-window backend fixture reproduced missing success/error while legacy opener controls passed. The implementation requests Spar's existing `success_redirect`/`error_redirect` format (wire-prefixed scheme, each URL at most 140 bytes), preserving bounded error labels. Each flow has its own ephemeral partition and closure-owned 192-bit one-use secret; only exact callbacks can transfer backend-scoped `zuid` cookies to the initiating account. All three former security quarantines pass, with deliberate replay/allowlist/domain regressions failing before restoration. PR #43 merged as `ef050e42` after 431 native tests (zero pending), 94 React tests and final-head build, analysis, all-platform packages and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34239266392) passed. The live IdP checkpoint remains required for customer compatibility qualification, separately from M3 automated acceptance under the September 14 maintainer-approved revision.

- Final automated acceptance: [PR #53](https://github.com/adamlow-wire/wire-desktop/pull/53) merged as `3c734cde363f1fcb783762997d247c4995ce6600`, with tree equal to reviewed `43961f6c`. [Build](https://github.com/adamlow-wire/wire-desktop/actions/runs/34901989433), [lint](https://github.com/adamlow-wire/wire-desktop/actions/runs/34901989529), [analysis](https://github.com/adamlow-wire/wire-desktop/actions/runs/34901989484), [all native platforms](https://github.com/adamlow-wire/wire-desktop/actions/runs/34901989430) and [authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34901989437) pass. Both authenticated platforms pass46 cases: Windows43 initial/three login-readiness retries; macOS42 initial/four login or account-action screen-readiness retries. No skips or worker errors. Windows native passed on its third unchanged-head attempt after two fixture-timeout failures; all attempts are retained and no assertion/deadline was changed. Native SSO controls, account limits, one-use/backend verdict/cookie isolation and three sensitivity-proven E2EI transport outcomes are qualified. The approved downstream QA obligation and lack of live customer-compatibility evidence remain explicit.

- TST-006 follow-up F-009: reopen diagnostic confidentiality under INV-010. Baseline `1a1093f5` records nine failing targets before the local fix; present Node-only cases and sensitivity pass. Native and composed qualification remain open. Historical M3 acceptance above is preserved.

#### CAP-003 — Migrate calling, media, display capture, and PiP

- Priority: `P1`
- Status: `done`
- Milestone: `M4`
- Dependencies: SEC-003, SEC-007, SEC-009
- Scope: Replace legacy global APIs for desktop capture and migrate call/PiP window behavior.
- Acceptance:
  - Existing call E2E passes without exposing unrestricted desktop capture.
  - Display capture is initiated only by an authorized view and user flow.
  - PiP windows use fixed secure preferences and controlled navigation.
  - Permission-denied behavior is tested.
- Design: Accepted DEC-011 uses an isolated local chooser/broker and bounded approved-stream relay. Bridge version2 intentionally removes the legacy `desktopCapturer` global and production enumeration endpoint, so the released webapp selects its existing `getDisplayMedia` path. Remote native display/legacy permission remains denied.
- Evidence: [Functional M4 acceptance audit](m4-acceptance.md) maps all four criteria to reviewed 41066868 in [PR #60](https://github.com/adamlow-wire/wire-desktop/pull/60). Build/types/lint/CodeQL and all native/package platforms pass; [full E2E/report 34986539616](https://github.com/adamlow-wire/wire-desktop/actions/runs/34986539616) completes 76 cases/platform. Linux/macOS pass initially; Windows has one group-member selection retry. Native macOS passes one reviewed unchanged-head retry after a retained two-second notification-denial timeout. All capture and corrected notification product cases pass. Coverage is 83.49% changed statements/92.46% tracked security branches; whole-M3/M4 cumulative evidence and sensitive policy checks are recorded in the audit. Final head adbebedc passed all required checks and merged through PR60 as 6e27c614; the newer TST-006 handoff audit remains open. Actual OS capture/privacy/portal/performance checks remain [QA](qa-display-capture.md), and packaged release acceptance remains PKG-001. No invariant or product assertion is waived.

#### CAP-004 — Migrate tray, notification, badge, menu, and shortcut integration

- Priority: `P1`
- Status: `in_progress`
- Milestone: `M4`
- Dependencies: TST-003, SEC-003, CAP-001
- Scope: Route OS integration through explicit main-process capabilities and preserve account-aware behavior.
- F-017 TST-006 follow-up: failed log archive creation/write/publication must preserve an existing user-selected destination. Stage privately on the destination filesystem with private output permissions and publish only a complete archive by rename; retain successful approved replacement and owned cleanup. The September15 functional acceptance below remains historical, not acceptance of this finding.
- Acceptance:
  - TST-003 and existing menu/notification E2E pass.
  - Renderer data cannot invoke arbitrary menu commands.
  - Notification activation targets the correct account/conversation.
- Evidence: [Functional M4 acceptance audit](m4-acceptance.md) reviews existing main-owned tray/menu/badge/notification and account-control code; no duplicate implementation is required. TST-003/native contracts and all 76 development E2E cases per platform qualify at 41066868 in [PR #60](https://github.com/adamlow-wire/wire-desktop/pull/60). Tests deny arbitrary/revoked/wrong-account commands and preserve exact notification account/conversation routing. Notification E2E invokes observed onclick callbacks; it does not click OS toasts. Visible packaged tray/menu/notification behavior remains the existing PKG-001 allocation. Final closure-head adbebedc passed all required checks and merged through PR60 as 6e27c614; TST-006 now owns the additional integrated handoff review.

#### CAP-005 — Migrate proxy, certificate, and managed configuration

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-003, SEC-009, TST-004
- Scope: Preserve enterprise network behavior without global or unauthenticated renderer authority.
- Machine endpoint read failures (September 14, INV-010): an unavailable registry dependency or a registry access error is configured-invalid policy, not proof that policy is absent. Block command-line, per-user, default and saved-account endpoint fallback and emit a non-secret diagnostic. Preserve unmanaged behavior only after a successful read with no configured value. The pinned registry library returns an empty array for a missing key and throws for other read failures. This intentionally strengthens the older fallback characterization; it does not change the separate App-lock override backend contract.
- Backend characterization checkpoint (2026-09-10): 23 fixture-adapter tests cover all three unchanged backend contracts and error fallbacks; Linux opt-out, macOS preference-key and Windows per-user-policy mutations fail seven targets. The combined central/backend/authorized-IPC suite passes 35/35 locally. Actual OS policy deployment/readback and final-platform gates remain open; the certificate candidate is preserved separately at `ad1211cd` with scoped-exception acceptance still pending.
- Certificate completion checkpoint (2026-09-10): seven synthetic decision baselines preserve Chromium delegation and explicit rejection; sensitivity mutation detects unconditional acceptance. Three regressions reproduce unanswered callbacks on verifier/dialog exceptions. The local repair returns denial once and does not retry a throwing callback; 11 focused tests pass. Native TLS, final-platform and exception-scope acceptance remain open; the legacy process-global pinning bypass is retained under the maintainer-approved product-parity decision below.
- Download-path contract (2026-09-09): retain ordinary home-relative nested folders, Unicode/spaces and clearing the setting; normalize separators before persistence. Reject traversal, rooted/drive/UNC/device/stream paths, ambiguous names and linked directory components. Validate saved configuration at startup and revalidate at download start; invalid enforced configuration blocks downloads until corrected and restarted rather than silently bypassing enterprise policy. The main-selected home base is trusted; defending against a same-user filesystem race after validation is not claimed. Native Windows junction evidence is required in addition to platform-independent policy tests.
- Path-policy reference: [Microsoft file/path naming rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file), including device aliases, superscript port numbers and trailing-dot/space ambiguity; use explicit Windows path semantics on every test host.
- Session contract (September 14): automatic system credentials require an exact configured proxy host (case-insensitive) and port match to the native challenge. Missing credentials, an unreadable settings source or a different proxy require the native prompt; no foreign credentials may be transmitted. Applying settings must succeed before authentication or saved proxy state changes. System-proxy credentials and native prompt submission apply settings to the web contents that raised the challenge. Cancellation clears that session and reloads that view; the main shell and unrelated accounts retain their routing. A real two-account proxy regression reproduces the old unrelated default-session mutation.
- Retained certificate policy (September 14, maintainer approved): preserve the existing native warning checkbox rather than changing product decisions during modernization. Pins are built into the certificate-check dependency for its known hostnames; there is no existing desktop MDM pinning setting. An explicit user choice disables only the additional pin checks process-wide until restart; the triggering request remains denied. Chromium certificate failures always remain denied, including after that choice. Unselected controls and errors never silently disable pinning. This is existing explicit product policy, not a new failure fallback or privileged renderer capability. Its broad scope remains a recorded concern for independent security review, and no claim of administrator-enforced pinning is made. A future managed pinning feature must prevent user override but is outside this migration.
- Acceptance:
  - Proxy credentials are handled only by the intended prompt and session.
  - Certificate verification and exception behavior are characterized and fail closed.
  - Managed configuration is read through an authorized, immutable contract.
  - Enforced Windows download paths are normalized and cannot traverse outside the approved base or select device/UNC targets.
  - Windows, macOS, and Linux managed-config backends have representative tests.
- Evidence: PR #16 provides authorized immutable managed-configuration reads and PR #25 provides bounded enforced-download-location updates. [PR #31](https://github.com/adamlow-wire/wire-desktop/pull/31) adds sensitivity-proven exact-prompt authorization, bounded credential handling, one-shot submit/cancel coordination, retry semantics, challenged-session proxy application, and cancellation reload behavior; all applicable hosted gates passed before merge. Download containment PR #45 merged as `d94253c9` after final-head build/lint/analysis, all-platform packages (including real Windows junction denial) and [Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34337502792) passed. Certificate policy, platform backend coverage, and packaged enterprise proxy/configuration evidence remain open.

- Final acceptance: reviewed PRs [#49](https://github.com/adamlow-wire/wire-desktop/pull/49), [#52](https://github.com/adamlow-wire/wire-desktop/pull/52) and [#54](https://github.com/adamlow-wire/wire-desktop/pull/54) integrate managed/backend and exact-session proxy behavior, fail-closed certificate callbacks and the approved retained pinning policy. PR #54 merged2ee0be97 with identical qualified tree e47febe4 after build/lint/analysis, all native platforms and [full E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34905928582) passed. Each E2E platform has45 initial passes/one recovered retry. Historical open-checkpoint statements above are superseded by these final records. The final-audit diagnostic correction is tracked under CAP-006 with supporting CAP-005 tests; broader enterprise/customer qualification remains downstream QA.

#### CAP-006 — Migrate deep links and single-instance behavior

- Priority: `P0`
- Status: `done`
- Milestone: `M3`
- Dependencies: SEC-013, CAP-001
- Scope: Preserve conversation, user, login, and SSO links while safely routing them to the intended account/window.
- Current second-instance composition: existing lifecycle PR #51 includes merged protocol18235a5a. Ordinary Windows/Linux lock losers exit without stale settings writes or updater scheduling; exact installed Squirrel lifecycle events retain handling. Preflight7d15a032 passes all three native/package platforms, including real Windows Electron-to-Electron delivery, zero secondary exit, exact selected-account routing and unchanged account count. Final current integration-head gates including authenticated E2E/report pass in PR #51 (see final acceptance below).
- Execution checkpoint: local candidate `cap/CAP-006-second-instance-2026-09-10` at `6902448a` supplied implementation and local lifecycle tests; native Windows and final-head qualification subsequently pass in PR #51. See final acceptance below.
- Final-audit correction (September15): INV-010 prohibits diagnostic payloads containing incoming SSO/join credentials or stored proxy credentials. Preserve exact dispatch and settings behavior while removing those payloads; supporting CAP-005 coverage shares this focused correction. Reviewed PR55 qualifies this corrected boundary as recorded below.
- Acceptance:
  - Action, stored-settings and proxy-startup diagnostics contain no credential payloads.
  - Valid links work before and after application readiness.
  - Invalid and hostile links fail closed.
  - Second-instance delivery cannot target an unauthorized view or invoke arbitrary actions.
- Evidence: final acceptance below; separate baselinesca1961e3/4a3859dc precede6902448a, with dispatch/activation/installer-deferral mutation failures and restored native/product passes recorded in testing.md.

- Final acceptance: [PR #51](https://github.com/adamlow-wire/wire-desktop/pull/51) merged as `c74d116e` after substantive review of exact head1eaf7fba and successful build/coverage, lint, analysis, all three native/package platforms and authenticated Windows/macOS E2E/report. Existing strict parser/external-link denials and authorized selected-account startup/running dispatch remain intact; actual second-Electron delivery verifies exact routing, zero secondary exit and unchanged account count. [Native34862334704](https://github.com/adamlow-wire/wire-desktop/actions/runs/34862334704) and [E2E/report34862337125](https://github.com/adamlow-wire/wire-desktop/actions/runs/34862337125) provide final platform evidence. macOS43 initial passes; Windows41 initial/two retry passes, no skips or worker errors. No acceptance criterion or security invariant is waived.

- Diagnostic acceptance: [PR55](https://github.com/adamlow-wire/wire-desktop/pull/55) merged4f4cfdaa after exact-head480acb50 review, all native platforms, build/lint/analysis and [47-case E2E/report per platform](https://github.com/adamlow-wire/wire-desktop/actions/runs/34909605643) pass. Sensitive tests verify exact immediate/queued action delivery, settings round trips and real startup proxy configuration while omitting credentials. Whole-M3 coverage at that head passes84.48% changed statements/98.48% tracked security branches. CAP-001 separately owns the startup redirect defect found in retained retry evidence; M3 remains open for that correction.

### 10.6 Packaging, update, and rollout

#### PKG-001 — Qualify packaging on the target Electron version

- Priority: `P1`
- Status: `in_progress`
- Milestone: `M4`
- Dependencies: ELC-002, ELC-003
- Scope: Build unsigned Windows Squirrel, Windows MSI, macOS, and Linux artifacts using Electron 43.4.0 and reviewed tooling for Wire engineering review. Preserve signed-release pipeline configuration; actual signing/notarization validation is Wire-owned after review under SEC-011/PKG-002/M5, per the September 15 maintainer decision.
- Acceptance:
  - Every supported artifact builds reproducibly in CI.
  - The signing/notarization/fuse/integrity pipeline order is documented and reviewed, with unsigned CI validating applicable build steps and effective settings. Actual signed-binary, notarization and post-sign integrity verification remains mandatory under SEC-011/PKG-002/M5 after Wire review; it is not claimed by unsigned success.
  - Supported OS versions, architectures and artifact formats are explicit; verify existing requirements before requesting missing product decisions. Unsigned artifacts launch and required packaged smoke tests actually execute on every in-scope platform.
  - Artifact identity and environment separation are preserved.
- TST-006 remediation: F-004 restricts packaged inputs; F-005 forbids credential-bearing configuration dumps/native errors in CLI diagnostics; F-006 requires failure propagation, metadata restoration on every outcome and reviewed fuse/signing order. Baseline `7eb299f3` establishes eight passing CLI controls and ten failing targets before the local fix. Actual signing/notarization remains deferred; local mock success never closes that gate. Installed Windows fuse test baseline `d91028f6` fails three targets before `eaec8b35` adds a real V1 wire read on both Squirrel and MSI executables. Six configured unsigned bits are enforced and all nine positions are reported; the file-protocol privilege default remains under SEC-011/PKG-003 review. Local direct-binary and sensitivity checks pass, hosted Windows execution pending.
- F-024 TST-006 finding: the prior Windows baseline CI built only an unpacked app, not Squirrel or MSI. Scoped baseline `b7a1d004` exposes five failures; candidate `4f10a6fb` adds unsigned dual-installer build, Squirrel full-package/ASAR identity and requested MSI administrative extraction/ASAR comparison. Five focused/395 tooling cases and three restored sensitivity perturbations pass locally. Separate baseline `a1e995d8` fails the omitted installed-smoke target; `87f85212` adds CI-only Squirrel/MSI install, installed-ASAR identity, startup/managed-proxy smoke and cleanup; omission sensitivity fails and six focused cases pass. Hosted Windows builder produced both installer families in PR #63, but the first two package runs stopped at the old ASAR verifier before MSI extraction/installation/startup; F-027 correction and final PR composition remain to qualify.
- F-024 hosted checkpoint: the third PR #63 run passes both Windows installer builds, Squirrel full-package archive identity, MSI administrative extraction/archive identity and unpacked managed/proxy smoke. Installed Squirrel launches with the verified ASAR but the installed test wrongly expects unmanaged policy on a potentially enrolled runner; baseline `08668b8c` and scoped explicit managed-fixture correction are recorded in [review findings](review-findings.md). Installed MSI and final-head hosted qualification remain mandatory.
- F-024 seventh/eighth hosted checkpoint: seventh PR #63 Windows job passes Squirrel/MSI installer builds, archive identity and both installed-app smoke paths, but the oversized development-artifact upload was cancelled after remaining active over 30 minutes. The scoped four-installer upload now fails if any file is missing. On eighth head `a72017d1`, Windows stops before packaging after the account fixture stalls at view startup and then session cleanup (221 passing/seven failures); `fdfcedd1` reuses two bounded native test sessions and requires hosted retest. Seventh Windows manifest is available, but fresh downloaded installer binaries and an accepted final-head package job remain mandatory.
- F-024/F-006 tenth hosted checkpoint: PR #63 head `e760f10e` passes the Windows/macOS/Linux unsigned package matrix; the downloaded four Windows installers have matching hosted unpacked/Squirrel/MSI ASAR identity, and installed Squirrel/MSI startup, managed/proxy path, cleanup and effective `010001011` fuses pass. Exact hashes and refreshed ELC-003 graph are in the [tenth-run artifact audit](shipped-linux-asar-audit.md#tenth-pr-63-exact-head-unsigned-windowsmacoslinux-audit--september-23). The preceding Windows smoke hang was cancelled without a retrievable phase log; the 90-second child bound is qualified by this successful run, not a proven root-cause diagnosis. Signed release criteria, SEC-011 extra-fuse disposition and final composed-head checks remain open.
- Hosted PR #63 head `e760f10e` E2E [`35905939092`](https://github.com/adamlow-wire/wire-desktop/actions/runs/35905939092) passes Windows/Linux 76/76 but fails macOS: the TST-005 native zero-exit restart times out once (`child.exitCode` stays `null`), passes on retry, and leaves a separate 90-second worker-teardown error. A green retry is not final-head qualification; preserve the exact native-exit assertion and add bounded cleanup/negative-path evidence before handoff.
- F-031 S3 promotion follow-up: test-only `20c61806` exposes stale-product/version selection before static release-key deletion; local `453273f2` reuses the validated requested-version Squirrel set before mutations. Four inert CLI controls and types pass; no S3 operation occurred. The GitHub draft selector still filters by extension, including potentially stale Windows/Linux files, and requires PKG-002 release-time disposition.
- SEC-011 file-protocol fuse disposition: [Electron fuse guidance](https://www.electronjs.org/docs/latest/tutorial/fuses) recommends disabling extra `file://` privileges when local pages use custom protocols. The production shell and auxiliaries use restricted `wire-app:`; the one-time legacy file-origin reader has JavaScript disabled and reads localStorage via debugger. Separate test baseline `873460bf` fails the new bit-7 expectation; local `3350819f` disables it and enforces it on installed Windows executables and macOS/Linux packages. Two focused tests/types/format pass, and the unchanged prior Linux binary is rejected by the new gate. Hosted package and legacy-profile/E2E qualification remain mandatory. Signed ASAR integrity and post-sign verification stay under M5; no security invariant is weakened.
- F-031 TST-006 finding under PKG-001: mixed-version Squirrel deploy directories select an older full nupkg despite an explicit requested version. Separate failing baselines `f3764f3b`/`1554b8f8` precede local `2136672b`, which requires exactly one requested-version package plus matching Setup/RELEASES in the same directory. Eleven focused, 25 deployment/pipeline and 422 full build-tool cases, types/lint, version/RELEASES sensitivity and selection against the downloaded Windows files pass; no upload occurred. The upload fix was published at fork PR #63 head `80c7ecf7`; generic, lint and CodeQL pass while package/E2E are running. Local S3 promotion follow-up is separate; GitHub draft selection remains under PKG-002 review.
- Evidence: See [review findings](review-findings.md) and [branded Linux installer audit](shipped-linux-asar-audit.md#f-022f-023-branded-linux-installer-rebuild). The earlier combined candidate's 22-file archive verifier missed eight required runtime images (F-022), its AppImage launcher disabled Chromium sandboxing (F-021), and Linux desktop/window identity and icons were incomplete (F-023). Separate failing baselines precede scoped corrections. The real internal AppImage/deb/rpm wrapper build at `9e058e73` passes local 30-file archive, exact 407-package approved-inventory, branded-icon, desktop-identity and six-fuse static checks; the AppImage has no sandbox-disabling flag. CI `32b31c2d` now builds/checks all three and runs extracted deb/rpm native smoke, but has not run on a hosted runner. Actual installation and desktop integration, packaged native startup, Windows/macOS artifacts, reproducible CI and final composed all-platform qualification remain mandatory.

#### PKG-002 — Qualify installers and updater behavior

- Pre-handoff F-007 slice: updater diagnostics must omit credential-bearing feed/error data and contain check/dialog/installation promise failures while preserving user consent. Local Node tests cover this boundary; startup routing and unsigned package policy have a local candidate requiring final composed/native qualification. Actual signed qualification remains M5.
- F-007 unsigned safeguard contract: macOS packaging must overwrite `macAutoUpdateEnabled` from build-owned facts: true only for internal distribution with a non-ad-hoc application signing identity configured and the corresponding signing step enabled; false for unsigned and App Store builds regardless of input metadata. Runtime requires a packaged app, literal true policy, internal distribution and non-development execution before configuring a feed. Missing/invalid policy fails closed. The flag records build intent, not cryptographic verification; failed signing must fail packaging, and actual signed/update qualification remains M5. No environment feed override may bypass this gate. The updater is routed once after successful main-window initialization, without a second `ready` registration.

- Priority: `P1`
- Status: `in_progress`
- Milestone: `M5`
- Dependencies: PKG-001, CAP-001
- Scope: Test fresh install, launch, update/upgrade, repair where applicable, uninstall, protocol registration, auto-launch, and retained user data.
- Acceptance:
  - Squirrel installations continue using Squirrel updates.
  - MSI installations do not invoke Squirrel and satisfy `docs/windows-msi.md`.
  - macOS update behavior is verified with signed/notarized artifacts.
  - Linux package launch and desktop integration are verified.
- Local pre-handoff evidence: startup/policy baselines `c96d5795`, `43c88dd7`, `331f79d6`; candidate `1dd68c0c` passes22 runtime/startup and329 tooling cases. ASAR-policy baseline `13456006` precedes26 passing synthetic-ASAR cases and sensitive CLI/enforcement checks. The macOS workflow requires archived literal-false policy; actual composed platform artifacts and all signed acceptance remain pending. See status and review-findings for commands and limitations.

#### PKG-003 — Validate legacy-to-modernized data migration

- Priority: `P0`
- Status: `in_progress`
- Milestone: `M5`
- Dependencies: CAP-001, PKG-002
- Scope: Upgrade representative released installations without losing accounts, settings, managed configuration, or required cached state.
- Acceptance:
  - Migration fixtures cover supported legacy versions and install types.
  - Account/session changes have documented recovery and rollback behavior.
  - A failed migration does not silently corrupt or delete user data.
- Evidence: TST-006 F-010 confirms settings migration/persistence data loss. Separate baselines `b122d801` and `f5f8684c`, local recovery tests and [settings recovery procedure](settings-recovery.md) are in progress; final hosted qualification is pending. Unsigned deterministic fixtures are brought forward for M4 handoff; full released-installation/rollback criteria remain M5.

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
- Dependencies: GOV-002, ELC-004, TST-005, TST-006, PKG-003, REL-001
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
| RSK-014 | Electron 43.4.0 shares the permission gate for legacy capture and modern display selection, so allowing the latter can bypass source choice through the former | confirmed callback limitation | high | Keep empty media types denied; preserve real-runtime regression tests; resolve a native-enforced distinction or approved alternative under SEC-009 before enabling capture. Do not replace source authorization with a page override or silently change the pinned runtime | adamlow-wire | open |
| RSK-015 | Proxy challenge handling applies settings to the main/default session instead of the challenged account | reproduced | high | CAP-005 binds submission/system credentials/cancel reload to challenged web contents; retain real two-account proxy regression and final native platform gates | adamlow-wire | open pending integration |

## 15. Decision log

| Decision ID | Date | Status | Decision | Rationale | Revisit condition |
| --- | --- | --- | --- | --- | --- |
| DEC-010 | 2026-09-10 | accepted | [Bounded production local content protocol](./decisions/0003-local-content-protocol.md) | Fixed role-specific assets avoid arbitrary filesystem serving while preserving migration and preloads | Asset, session, CSP or legacy-import incompatibility |
| DEC-011 | 2026-09-15 | accepted | [Trusted local display capture](./decisions/0004-consented-display-capture.md) | Main-owned source consent and bounded relay retain native remote capture denial | Native permission separation, transferable tracks, performance or capture capability requirements change |
| DEC-009 | 2026-09-14 | accepted | [Main-owned account permission consent and document-scoped grants](./decisions/0002-account-permission-consent.md) | Explicit main-owned document-scoped consent is integrated and qualified; display and thumbnail capture stay denied under CAP-003/M4 | Missing identity in required notification/media flows, capture bypass or calling incompatibility |
| DEC-001 | 2026-08-18 | accepted | Modernize through a replacement Electron shell inside a fork rather than rewriting the whole product or only flipping legacy flags | Preserves platform knowledge while allowing a new security boundary | New evidence shows retained code creates more risk than replacement |
| DEC-002 | 2026-08-18 | accepted | Use a protected integration branch feeding a final upstream PR | Supports staged capability work and final integration testing | Upstream requests a different contribution strategy |
| DEC-003 | 2026-08-18 | accepted | Supported Electron runtime and security-boundary work are P0 | The current runtime is EOL and the current boundary violates modern Electron security guidance | Never; only implementation ordering may change |
| DEC-004 | 2026-08-18 | accepted | Use `WebContentsView` for remote account content | Electron discourages `<webview>`; main ownership improves policy control | The M2 spike identifies a safer supported architecture or an unresolvable platform constraint |
| DEC-005 | 2026-08-18 | accepted | Target latest stable Electron dynamically, not version 43 permanently | Prevents this plan becoming stale during a long migration | Electron release/support policy materially changes |
| DEC-006 | 2026-08-18 | accepted | Operate as a solo AI-assisted maintainer with PR-only integration and zero required external approvals | Preserves traceability and automated gates without pretending unavailable organizational review exists | Additional maintainers join or upstream mandates another process |
| DEC-007 | 2026-08-26 | accepted | Keep Electron 43.4.0 during M3 and defer Electron 44 adoption | Electron 43.4.0 completed M1 with cross-platform evidence; Electron 44 is not an M3 gate and removes Windows ia32 artifacts, so adopting it now would mix a platform-scope decision into security-critical capability migration | Before the next Electron upgrade or any release-candidate cut |
| DEC-008 | 2026-09-03 | accepted | Run authenticated cross-platform E2E at behavior-changing PRs and coherent M3 checkpoints rather than every mechanical IPC schema migration | Required CI and focused security tests remain per PR; checkpoint E2E preserves product evidence while avoiding repeated long staging runs that provide no additional coverage for schema-only changes | A deferred E2E gap survives its checkpoint or a schema-only change causes an undetected product regression |

## 16. Open questions

| Question ID | Question | Needed by | Owner | Resolution |
| --- | --- | --- | --- | --- |
| Q-011 | Which QA environment supports live SSO and Keycloak/OIDC/ACME enrolment and renewal validation? | Downstream QA / DCP-003 / DCP-022 | QA owner to be assigned | Deferred from M3 environment provisioning by maintainer on September 14. Execute qa-sso-e2ei.md before claiming customer compatibility. Credentials stay outside source and chat. |
| Q-001 | Which Windows, macOS, and Linux versions are release-blocking? | M0 | adamlow-wire | All three platforms remain in scope; minimum supported OS versions are fixed under PKG-001 before release qualification |
| Q-002 | Which identity providers and federation variants form the mandatory SSO matrix? | TST-002 | adamlow-wire | Automate protocol behavior with deterministic fixtures; record real-provider evidence when available without making an undocumented vendor list an M0 dependency |
| Q-003 | Can the Wire webapp accept a versioned `contextBridge` adapter, and where should that adapter live? | ARC-001 | adamlow-wire | Resolved by PR #35: desktop-owned preloads expose immutable named APIs; fixed main-world adapters preserve existing webapp globals/events. Authenticated Windows/macOS E2E passes without a webapp source change. |
| Q-004 | Which account state must migrate, and which caches may be safely rebuilt? | PKG-003 | Product/security | TBD |
| Q-005 | Which certificate interception/bypass behavior remains a product requirement? | CAP-005 | Maintainer | Resolved September 14: preserve existing built-in pinning and native user override without inventing MDM policy; retain mandatory Chromium validation, default pinning and restart reset. Record the broad override for independent security review. |
| Q-006 | Is Linux feature parity equal to Windows/macOS or a defined subset? | BASE-002 | adamlow-wire | Retain the current capability scope on Linux; document unavoidable platform differences explicitly and test them under their owning capability |
| Q-007 | What staged rollout and telemetry are permissible for this security-sensitive product? | REL-002 | Product/privacy/security | TBD |
| Q-008 | Who are the accountable technical, security, product, platform, SSO, and release-engineering approvers? | M0 | adamlow-wire | `adamlow-wire` is the accountable solo maintainer for each role; PR merges record self-review, not independent review |
| Q-012 | Who at Wire will execute signing/notarization and signed-package qualification after engineering review? | M5 / SEC-011 / PKG-002 | Wire contact to be arranged by maintainer | Maintainer defers actual signing validation to Wire; unsigned M4 handoff may proceed. Named executor and access remain unconfirmed; this is not release acceptance. |
| Q-009 | Which existing Wire CI credentials and runners may be provisioned to the fork for E2E, signing, and package evidence? | M0 | adamlow-wire | Raw E2E values use private `E2E_WEBAPP_URL`, `E2E_BACKEND_URL`, and `E2E_BACKEND_BASIC_AUTH` Actions secrets; unsigned development macOS testing is valid before release qualification; signing is deferred to M5; Jira is not used by the fork |
| Q-010 | Must the first modernized release retain Windows 32-bit (ia32) packages? | Next Electron upgrade | adamlow-wire | TBD; Electron 44 adoption is deferred until this is resolved |

## 17. Change log

| Revision | Date | Author | Change | Affected IDs |
| --- | --- | --- | --- | --- |
| 1.5.93 | 2026-09-23 | Codex | Record published F-031 upload selection, separate failing S3 promotion test/fix, and test-first SEC-011 file-privilege fuse disposition; retain hosted and signed-release gates | PKG-001, TST-005, TST-006, SEC-011, PKG-002 |
| 1.5.92 | 2026-09-23 | Codex | Record successful tenth unsigned Windows/macOS/Linux package and installed-fuse audit; add separate F-031 versioned Squirrel deployment baselines and local identity fix without claiming final composition | PKG-001, TST-005, TST-006, ELC-003, SEC-011, DCP-017, DCP-018 |
| 1.5.90 | 2026-09-23 | Codex | Record eighth hosted three-platform DCP-007 pass and macOS logout retry as an open TST-005 qualification issue | TST-005, DCP-007, TST-006 |
| 1.5.89 | 2026-09-23 | Codex | Record eighth hosted Windows native fixture failure, cross-platform package/E2E progress, and sensitivity-tested installed Windows fuse check; retain final-head and SEC-011 disposition gates | PKG-001, TST-005, TST-006, SEC-011 |
| 1.5.88 | 2026-09-23 | Codex | Record seventh hosted Windows installed Squirrel/MSI step and exact macOS/Linux graphs; keep artifact upload, calling warning, full fuse disposition and final-head gates open | PKG-001, TST-005, TST-006, SEC-011, ELC-003 |
| 1.5.86 | 2026-09-23 | Codex | Bound and phase-label the fourth hosted Windows installed-smoke wait after a separate failing CI-duration baseline; require actual Squirrel/MSI completion | PKG-001, TST-005, TST-006 |
| 1.5.85 | 2026-09-23 | Codex | Trace F-028 fourth hosted updater fixture timeout to nested Electron GUI mode; add separate failing Node-mode baseline and scoped test-only correction | TST-005, PKG-002, TST-006 |
| 1.5.84 | 2026-09-23 | Codex | Record third hosted Windows Squirrel policy-fixture failure and scoped F-024 managed fixture correction; retain installed MSI and final native gates | PKG-001, TST-005, TST-006 |
| 1.5.83 | 2026-09-23 | Codex | Record third hosted deb/rpm native successes, expose remaining AppImage selector and F-028 nested Xvfb environment failures, and add sensitivity-proven test/CI corrections | PKG-001, TST-005, PKG-002, TST-006 |
| 1.5.82 | 2026-09-23 | Codex | Account for actual draft PR63 Windows/macOS/Linux shipped graphs offline against approved advisory input; retain platform call-path and final-head review | ELC-003, PKG-001 |
| 1.5.81 | 2026-09-23 | Codex | Correct F-026 Linux installer executable selection and F-027 Windows ASAR stat lookup after failing real-hosted jobs and sensitive baselines; retain final hosted/native gates | PKG-001, TST-005, TST-006 |
| 1.5.79 | 2026-09-23 | Codex | Record draft PR63 hosted failures, correct documentation lint and Linux test-helper setup, and add bounded package-gate diagnostics; retain all installer/native acceptance gates | PKG-001, TST-005, TST-006 |
| 1.5.76 | 2026-09-23 | Codex | Add scoped Windows CI installed Squirrel/MSI startup and managed-policy smoke after separate failing gate baseline; hosted behavior remains unrun | PKG-001, TST-005, TST-006, DCP-017, DCP-018 |
| 1.5.75 | 2026-09-23 | Codex | Add scoped F-024 unsigned Windows Squirrel/MSI build and payload identity gates with failing baseline; retain installed-artifact and hosted qualification | PKG-001, TST-005, TST-006, DCP-017, DCP-018 |
| 1.5.74 | 2026-09-23 | Codex | Record F-024: Windows package CI currently qualifies only unpacked app, not required Squirrel/MSI installers; require sensitive installer-format and installed-startup gates under existing PKG-001/TST-005 | PKG-001, TST-005, TST-006, DCP-017, DCP-018 |
| 1.5.73 | 2026-09-23 | Codex | Refresh TST-006 changed-path accounting to 528 current candidate paths and bound F-021/F-022/F-023 capability/invariant traces without claiming review completion | TST-006, PKG-001, DCP-005, DCP-020, INV-001 |
| 1.5.72 | 2026-09-23 | Codex | Disposition the two non-high/critical matches in the exact final scoped Linux shipped graph by advisory trigger and reviewed call path; retain final-platform graph gates | ELC-003, PKG-001 |
| 1.5.71 | 2026-09-23 | Codex | Record missing packaged runtime images and Linux branding/desktop identity findings, scoped fixes and static all-format evidence; retain hosted/native/final-head gates | PKG-001, TST-006, F-022, F-023, DCP-005, DCP-020 |
| 1.5.70 | 2026-09-23 | Codex | Record scoped AppImage sandbox-launch correction and environment-correct static artifact evidence while retaining native/final-head gates | PKG-001, TST-006, INV-001, DCP-020 |
| 1.5.69 | 2026-09-23 | Codex | Record confirmed AppImage sandbox-disable defect F-021 under PKG-001 and INV-001 without relaxing the sandbox invariant | PKG-001, TST-006, INV-001, DCP-020 |
| 1.5.68 | 2026-09-23 | Codex | Record actual unsigned Linux AppImage/deb/rpm static artifact qualification and its native/final-head limits | PKG-001, ELC-003, TST-005 |
| 1.5.67 | 2026-09-23 | Codex | Record scoped dependency-root pruning and exact combined Linux ASAR evidence; retain native, installer and platform acceptance gates | PKG-001, ELC-003, TST-006 |
| 1.5.66 | 2026-09-23 | Codex | Extend CAP-001 confidentiality acceptance to active account-preload IPC rejection diagnostics with separate baseline and sensitivity evidence | CAP-001, INV-010, TST-006 |
| 1.5.65 | 2026-09-22 | Codex | Reopen existing CAP-004 for reproduced log-export destination data loss and separate baseline | CAP-004, DCP-005, F-017, TST-006 |
| 1.5.64 | 2026-09-22 | Codex | Define build-owned unsigned-update policy and repair F-007 startup routing with separate baseline targets | PKG-002, F-007 |
| 1.5.63 | 2026-09-22 | Codex | Start existing PKG-002 pre-handoff updater failure/diagnostic remediation; retain startup and signed-release gates | PKG-002, F-007, INV-010 |
| 1.5.60 | 2026-09-22 | Maintainer in chat; Codex | Activate mandatory unsigned review-handoff closeout; make acceptance gates and later release qualifications explicit, retaining existing owners and invariants | PKG-001, TST-005, TST-006, ELC-003, SEC-003, PKG-003, GOV-002 |
| 1.5.59 | 2026-09-16 | Codex | Start PKG-001 remediation of packaged inputs, secret diagnostics and fail-closed builds; retain unsigned scope and signed-release deferral | PKG-001, SEC-011, INV-010, TST-006 |
| 1.5.58 | 2026-09-15 | Codex | Extend existing CAP-001 remediation with bounded log admission and immutable queued inputs; preserve cleanup barriers and document diagnostic truncation/loss | CAP-001, INV-010, TST-006 |
| 1.5.57 | 2026-09-15 | Codex | Reopen CAP-002 for sensitive SSO diagnostics with an explicit safe logging contract and separate failing baseline; preserve authentication and pinning behavior | CAP-002, INV-010, TST-006 |
| 1.5.56 | 2026-09-15 | Codex | Reopen SEC-003 for bounded pending native saves and rate-limiter lifetime findings; retain encryption ownership decision and native/composed gates | SEC-003, SEC-004, TST-006, DCP-014 |
| 1.5.55 | 2026-09-15 | Codex | Bring forward PKG-003 settings preservation and recovery fixtures for confirmed F-010; retain full released-migration acceptance in M5 | PKG-003, TST-006, DCP-021 |
| 1.5.54 | 2026-09-15 | Codex | Start integrated review and record full-delta findings; reopen CAP-001 for sensitive bounded lifecycle queue remediation without changing security invariants | TST-006, CAP-001 |
| 1.5.53 | 2026-09-15 | Codex | Add TST-006 integrated quality/baseline-provenance/test-completeness gate; define unsigned M4 review handoff and defer actual signing validation to Wire in M5 without weakening INV-009; reconcile merged PR60 | TST-006, TST-005, ELC-003, PKG-001, SEC-011, PKG-002, GOV-002 |
| 1.5.52 | 2026-09-15 | Codex | Reopen Windows package execution evidence after a false-success version probe; require explicit smoke completion and deterministic managed fixtures without changing application policy or claiming unmanaged Windows QA | TST-005, CAP-005 |
| 1.5.51 | 2026-09-15 | Codex | Accept reviewed functional CAP-003/CAP-004 and development TST-005 after all-platform qualification; accept DEC-011, reconcile DEC-010 clerical status, retain final documentation-head merge gates and explicit packaging/OS/live-QA limits | CAP-003, CAP-004, TST-005, DEC-011 |
| 1.5.50 | 2026-09-15 | Codex | Reconcile CAP-003 with published fixture corrections; renew whole-milestone coverage and record capture diagnostics/OS QA handoff without claiming final platform acceptance | CAP-003, TST-005 |
| 1.5.49 | 2026-09-15 | Codex | Restore CAP-001 acceptance after sensitivity-proven queued-log cleanup and reviewed PR #59 final-head qualification; reconcile functional TST-005 with actual integration | CAP-001, TST-005 |
| 1.5.48 | 2026-09-15 | Codex | Accept all M3 work after reviewed PR #56 and complete final-head/aggregate evidence; clarify the previously accepted TST-003 packaged-smoke allocation and continue functional M4 | CAP-001, TST-003, CAP-003, CAP-004, TST-005 |
| 1.5.47 | 2026-09-15 | Codex | Reopen CAP-001 for a native-reproduced same-origin startup redirect teardown found in retained PR55 retry evidence; require completed authorized replacement and bounded lifetime checks | CAP-001, INV-010 |
| 1.5.46 | 2026-09-15 | Codex | Integrate qualified retained pinning PR #54; reopen CAP-006 for final-audit action/settings/startup credential diagnostics under INV-010 | CAP-006, CAP-005 |
| 1.5.45 | 2026-09-14 | Codex | Close CAP-002 automated acceptance after reviewed PR #53 and final native/authenticated/report gates; reconcile retained pinning candidate with actual integration and preserve downstream live QA | CAP-002, CAP-005, Q-011 |
| 1.5.44 | 2026-09-14 | Maintainer in chat; Codex | Resolve Q-005 by preserving existing pinning product behavior with explicit default/consent/Chromium-denial/reset characterization; retain broad-override concern for independent review | CAP-005, Q-005 |
| 1.5.43 | 2026-09-14 | Maintainer in chat; Codex | Separate M3 automated desktop-boundary acceptance from downstream live Keycloak/SSO/E2EI QA; retain every security invariant and explicitly withhold live compatibility claims | CAP-002, DCP-003, DCP-022, Q-011 |
| 1.5.42 | 2026-09-14 | Codex | Close CAP-006 and SEC-013 after reviewed lifecycle PR #51 and all final-head checks; qualify existing certificate slice against actual integration | CAP-006, SEC-013, CAP-005 |
| 1.5.41 | 2026-09-14 | Codex | Close SEC-010 and accept DEC-010 after reviewed protocol PR #50 and all final-head gates; qualify existing lifecycle candidate against actual integration | SEC-010, DEC-010, CAP-006, SEC-013 |
| 1.5.40 | 2026-09-14 | Codex | Reconcile preserved lifecycle candidate with current protocol and final CAP-005 credential/native-test qualification; require current composition and final-head gates | CAP-006, SEC-013 |
| 1.5.39 | 2026-09-14 | Codex | Reconcile preserved protocol candidate with merged account cutover and final CAP-005 credential/session/native qualification; retain all security contracts and require current-head gates | SEC-010, CAP-005 |
| 1.5.38 | 2026-09-14 | Codex | Close CAP-001/SEC-007/SEC-009 after reviewed PR #47 final-head gates and integration merge; accept the qualified notification/media policy, retain display denial and remaining M3 gates | CAP-001, SEC-007, SEC-009, DEC-009 |
| 1.5.37 | 2026-09-14 | Codex | Reconcile existing second-instance candidate with protocol, proxy/registry fixes and native setup evidence | CAP-006, SEC-013, CAP-005 |
| 1.5.36 | 2026-09-14 | Codex | Reconcile existing local-protocol candidate with current metadata/native-quit and CAP-005 registry/proxy fixes | SEC-010, CAP-005, CAP-001 |
| 1.5.35 | 2026-09-14 | Codex | Reproduce unrelated-session proxy mutation with a real native prompt; bind proxy application and cancellation reload to the challenged view without changing credential/IPC authorization | CAP-005, DCP-011, RSK-015 |
| 1.5.34 | 2026-09-14 | Codex | Reproduce and close machine endpoint fallback after unavailable/failed registry reads; preserve genuinely absent policy and prepare real Windows reader/destination sensitivity proof | CAP-005, INV-010 |
| 1.5.33 | 2026-09-14 | Codex | Reconcile existing single-instance candidate and actual child-process fixture with short profiles and local protocol | CAP-006, SEC-013 |
| 1.5.32 | 2026-09-14 | Codex | Reconcile finite local-protocol candidate with reviewed account/permission/managed-destination code; preserve CSP, minimal privileges, legacy import and hosted gates | SEC-010, DEC-010, CAP-001 |
| 1.5.31 | 2026-09-14 | Codex | Integrate reviewed permission dependency through PR #48 and reconcile existing managed destination baseline/enforcement into PR #47; retain final cutover gates and CAP-005 native registry qualification | CAP-001, SEC-007, SEC-008, SEC-009 |
| 1.5.30 | 2026-09-14 | Codex | Reproduced unconsented desktop-thumbnail enumeration and removed its production account capability pending authorized source selection; preserve device consent and all milestone gates | SEC-009, DCP-008, INV-006 |
| 1.5.29 | 2026-09-14 | Codex | Revalidated remote state, restored an executable closeout handoff and corrected CAP-006 to in progress; no gate closed or scope changed. Revision follows parallel candidate revisions 1.5.26–1.5.28, whose branch-specific changes still require reconciliation | CAP-006, CAP-001, CAP-002, SEC-009, SEC-010 |
| 1.5.25 | 2026-09-10 | Codex; approved by maintainer in chat | Explicitly include E2EI enrolment/renewal and separate live SSO/E2EI acceptance in M3; retain webapp cryptography ownership and navigation/session invariants | CAP-002, SEC-008, DCP-022, Q-011 |
| 1.5.24 | 2026-09-10 | Codex | Recorded sensitivity-proven legacy/modern capture callback limitation and its open risk; retained runtime pin, source-selection requirement and all M3 acceptance gates | SEC-009, DEC-009, RSK-014 |
| 1.5.23 | 2026-09-10 | Codex | Activated native account notification/media consent in the local candidate after product baseline/allow/reload-denial evidence; retained all display, platform and final-head acceptance gates | SEC-009, DEC-009, CAP-003 |
| 1.5.22 | 2026-09-10 | Codex | Reconciled SEC-009 implementation evidence for native policy/session composition, cancellation, fake media and notification routing/readiness; retained production denial and all platform/display acceptance gates | SEC-009, DEC-009, INV-006 |
| 1.5.21 | 2026-09-10 | Codex | Recorded proposed main-owned consent/document-scoped grant ADR and sensitivity-tested unwired policy; production stays deny-all and permission integration/platform gates remain open | SEC-009, DEC-009, INV-006 |
| 1.5.20 | 2026-09-10 | Codex | Started SEC-009 on a separate dependent branch with real native permission callback characterization; retained deny-all and all existing acceptance gates while consent/grant policy is designed | SEC-009, INV-006 |
| 1.5.19 | 2026-09-09 | Codex | Characterized download preparation, reproduced unsafe path writes and specified normalized home-relative enforcement across update/startup/download boundaries | CAP-005, DCP-013 |
| 1.5.18 | 2026-09-09 | Codex | Explicit public-only credential-free preview contract and bounded field-specific parser after reproducing private fetches and inherited-object mutation; preserve ordinary account traffic and required preview fields | SEC-012, DCP-015, INV-007 |
| 1.5.17 | 2026-09-09 | Codex | Reconciled merged SSO, navigation, metadata and parser evidence; restored concise M3 handoff and synchronized CSP validation without claiming remaining cutover or capability acceptance | SEC-008, SEC-010, SEC-012, SEC-013, CAP-001, CAP-002 |
| 1.5.16 | 2026-09-08 | Codex | Reproduced isolated SSO backend verdict loss; adopted native redirects with per-flow callback/session isolation and activated the three owned security targets | CAP-002, DCP-003, INV-004, INV-005 |
| 1.5.15 | 2026-09-08 | Codex | Started independent CSP eval removal with production/development compatibility and real ordinary-script denial evidence; retained custom-scheme/account-state migration as an explicit gate | SEC-010, CAP-001 |
| 1.5.14 | 2026-09-08 | Codex | Reproduced and rejected desktop-owned identity/session overwrites through webapp metadata; preserved known metadata and environment updates, retained main-owned lifecycle and destination-policy cutover | CAP-001, CAP-005, DCP-002, DCP-004 |
| 1.5.13 | 2026-09-08 | Codex | Isolated a renderer-loss harness fix after proving host crash handling delayed process-loss notification; strengthened revocation-order evidence without changing runtime code or deadlines | CAP-001, TST-004 |
| 1.5.12 | 2026-09-08 | Codex | Recorded merged sandboxing evidence and split incoming deep-link parsing ahead of navigation merge to preserve valid chat links; retained external/lifecycle closure | SEC-006, SEC-008, SEC-013, CAP-005, CAP-006 |
| 1.5.11 | 2026-09-08 | Codex | Closed sandboxing with merged PR #37 and final-head cross-platform evidence; began central navigation policy and documented main-owned SSO creation after reproducing ineffective child-session overrides | SEC-006, SEC-008, SEC-013, DCP-003, DCP-009, DCP-011, DCP-014 |
| 1.5.10 | 2026-09-08 | Codex | Began sandbox-compatible preload bundling and explicit main-owned bootstrap/image-copy contracts; local validation and hosted gates remain open | SEC-006, INV-001, INV-002, DCP-014 |
| 1.5.9 | 2026-09-07 | Codex | Closed isolated bridges with merged PR #35 and cross-platform evidence; resolved adapter ownership and made sandboxing executable | SEC-005, SEC-006, Q-003, INV-002 |
| 1.5.8 | 2026-09-04 | Codex | Began SEC-005 with sensitivity-proven real-Electron characterization of the local-shell and Wire webapp preload compatibility surfaces | SEC-005, INV-002 |
| 1.5.7 | 2026-09-04 | Codex | Closed SEC-004 after the corrected remote-free runtime passed all-platform package smoke and authenticated Windows/macOS E2E | SEC-004, DCP-003, DCP-014, INV-002, INV-003, INV-010 |
| 1.5.6 | 2026-09-04 | Codex | Recorded and fixed the pre-ready locale regression exposed by SEC-004 package smoke validation | SEC-004, DCP-003 |
| 1.5.5 | 2026-09-04 | Codex | Closed SEC-003 after green PR #32 and recorded the sensitivity-proven SEC-004 removal of all production `@electron/remote` access pending hosted validation | SEC-003, SEC-004, DCP-003, DCP-014, INV-002, INV-003, INV-010 |
| 1.5.4 | 2026-09-04 | Codex | Recorded green proxy-prompt E2E and the final SEC-003 inventory audit; replaced the internal About event with a direct main-owned call and removed the unproduced updater listener | SEC-003, CAP-005, INV-002, INV-003, INV-010 |
| 1.5.3 | 2026-09-03 | Codex | Recorded green About-window validation and the sensitivity-proven exact-prompt proxy credential/cancellation boundary while retaining packaged enterprise network evidence under CAP-005 | SEC-003, CAP-005, DCP-011, INV-002, INV-003, INV-004, INV-010 |
| 1.5.2 | 2026-09-03 | Codex | Recorded green SSO control validation and the sensitivity-proven, bounded About locale/version exchange while retaining selected-account isolation under CAP-001 | SEC-003, CAP-001, INV-002, INV-003, INV-010 |
| 1.5.1 | 2026-09-03 | Codex | Recorded sensitivity-proven, account-owned SSO window close/focus contracts while retaining the broader SSO security targets under CAP-002 | SEC-003, CAP-002, DCP-003, INV-002, INV-003, INV-004, INV-010 |
| 1.5.0 | 2026-09-03 | Codex | Recorded merged deep-link IPC evidence and reorganized remaining M3 work into five coherent execution checkpoints without changing any milestone acceptance criterion | SEC-003, SEC-004, SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, SEC-010, SEC-012, SEC-013, CAP-001, CAP-002, CAP-005, CAP-006, DEC-008 |
| 1.4.16 | 2026-09-03 | Codex | Recorded green hosted desktop-source validation and the sensitivity-proven application-shell-only deep-link submission contract while retaining parser and lifecycle policy under SEC-013 and CAP-006 | SEC-003, SEC-009, SEC-013, CAP-003, CAP-006, DCP-008, DCP-010 |
| 1.4.15 | 2026-09-03 | Codex | Recorded green hosted download-location validation and the sensitivity-proven account-only desktop-source enumeration contract while retaining user-gesture policy under SEC-009 | SEC-003, SEC-009, CAP-003, CAP-005, DCP-008, DCP-013 |
| 1.4.14 | 2026-09-03 | Codex | Recorded green hosted Open Graph validation and the sensitivity-proven account-only download-location update contract while retaining path policy under CAP-005 | SEC-003, SEC-012, CAP-005, DCP-013, DCP-015 |
| 1.4.13 | 2026-09-03 | Codex | Recorded green hosted wrapper relaunch evidence and the sensitivity-proven account-only Open Graph IPC contract while retaining full fetch policy under SEC-012 | SEC-003, SEC-012, DCP-015 |
| 1.4.12 | 2026-09-03 | Codex | Recorded green hosted wrapper reload evidence and the sensitivity-proven, account-only application relaunch contract | SEC-003, CAP-001, DCP-002 |
| 1.4.11 | 2026-09-03 | Codex | Recorded green hosted exact-target account deletion evidence and the sensitivity-proven, account-only wrapper reload contract | SEC-003, CAP-001, DCP-002, DCP-004 |
| 1.4.10 | 2026-09-03 | Codex | Recorded green hosted badge-count evidence and the sensitivity-proven exact-target account data deletion contract | SEC-003, CAP-001, DCP-004 |
| 1.4.9 | 2026-09-03 | Codex | Recorded green hosted webapp-loaded evidence and the sensitivity-proven, authorized badge-count contract | SEC-003, CAP-004, DCP-006 |
| 1.4.8 | 2026-09-03 | Codex | Recorded green hosted notification-activation evidence and the sensitivity-proven, rate-limited webapp-loaded queue-flush contract | SEC-003, CAP-001, DCP-002 |
| 1.4.7 | 2026-09-03 | Codex | Recorded green hosted save-picture evidence and the sensitivity-proven, rate-limited notification-activation IPC contract | SEC-003, CAP-004, DCP-006 |
| 1.4.6 | 2026-09-02 | Codex | Recorded green hosted managed-configuration evidence and the sensitivity-proven bounded save-picture IPC contract | SEC-003, CAP-005, DCP-013, DCP-014 |
| 1.4.5 | 2026-09-02 | Codex | Recorded green hosted safe-storage evidence and the sensitivity-proven synchronous managed-configuration contract plus the authoritative privileged incoming IPC inventory | SEC-003, CAP-005, DCP-013, DCP-016 |
| 1.4.4 | 2026-09-02 | Codex | Recorded the green hosted typed-IPC foundation and a sensitivity-proven, bounded safe-storage contract slice while retaining ciphertext ownership and packaged key-store evidence as explicit gaps | SEC-003, DCP-016, INV-003, INV-004, INV-010 |
| 1.4.3 | 2026-09-02 | Codex | Closed SEC-002 with green hosted platform evidence and started SEC-003 with a fail-closed typed IPC contract foundation plus the first bounded channel migration | SEC-002, SEC-003 |
| 1.4.2 | 2026-09-02 | Codex | Closed TST-003 with green hosted platform evidence and recorded the sensitivity-proven SEC-002 central view-authority implementation pending hosted validation | TST-003, SEC-002, DCP-003, DCP-005, DCP-009, DCP-011 |
| 1.4.1 | 2026-09-02 | Codex | Recorded sensitivity-proven TST-003 tray platform characterization and its remaining hosted package gate | TST-003, DCP-005 |
| 1.4.0 | 2026-09-02 | Codex | Recorded merged CAP-001 targeted deletion, synchronized upstream through `6f9b6a99`, and moved the still-product-wide security work from the completed bounded M2 proof into M3 | GOV-001, SEC-002 through SEC-008, SEC-010, SEC-013, TST-003, CAP-001 |
| 1.3.1 | 2026-08-26 | Codex | Recorded the green upstream synchronization and retained Electron 43.4.0 as the explicit M3 runtime baseline | GOV-001, CAP-001, DEC-007 |
| 1.3.0 | 2026-08-26 | Codex | Added a bounded CAP-001 data-deletion slice that removes view authority before clearing only the targeted persistent session and prevents same-account recreation during deletion | CAP-001, DCP-004, INV-004, INV-010 |
| 1.2.0 | 2026-08-26 | Codex | Reconciled merged PR #8 evidence, incorporated upstream native MSI work, corrected CAP-001 evidence ownership, and recorded the decision to keep Electron 43.4.0 during M3 while Windows ia32 scope remains unresolved | GOV-001, GOV-002, CAP-001, DEC-007, Q-010, RSK-003 |
| 1.1.0 | 2026-08-21 | Codex | Started M3 with a bounded, test-first account-selection slice that preserves stable identities and proves exact-target isolation in the secure shell; retained product routing and data deletion as explicit CAP-001 follow-up work | CAP-001, DCP-002, INV-003, INV-004, INV-010 |
| 1.0.0 | 2026-08-21 | Codex | Closed the bounded M2 secure-shell proof with cross-platform integration/package evidence, hostile-boundary tests, passing changed-code coverage, and authenticated legacy E2E; made the proof and its regression suite the executable prerequisites for M3 account migration | ARC-002, TST-004, CAP-001, SEC-007 |
| 0.9.0 | 2026-08-21 | Codex | Closed the Electron 43 runtime milestone and bounded M2 as an opt-in secure-shell proof; retained production fuse, signing, and integrity qualification in M5 | ELC-002, ARC-002, INV-009, SEC-011 |
| 0.8.0 | 2026-08-20 | Codex | Revalidated Electron 43.4.0 as latest stable, replaced assumed per-major upgrade ceremony with a direct evidence-driven transition, and made Linux packaging failures/artifact absence fatal | ELC-001, ELC-002, PKG-001 |
| 0.7.0 | 2026-08-20 | Codex | Closed M0 after accepted governance, capability, architecture, threat-model, baseline, and deterministic SSO evidence; made the Electron 38→39 upgrade the next work | BASE-002, ARC-001, SEC-001, TST-002, DEC-004, ELC-002 |
| 0.6.3 | 2026-08-20 | Codex | Completed the reproducible legacy baseline after authenticated group-call and logout stabilization passed on Windows and macOS | BASE-001 |
| 0.6.2 | 2026-08-20 | Codex | Clarified that M0 records reproducible legacy packaging failures rather than requiring their implementation fix before baseline closure | BASE-001, PKG-001 |
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
