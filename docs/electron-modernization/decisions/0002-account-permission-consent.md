---
decision_id: DEC-009
adr: 0002
status: proposed
date: 2026-09-10
owners: [adamlow-wire]
work_items: [SEC-009, CAP-003]
invariants: [INV-003, INV-004, INV-006, INV-010]
supersedes: []
---

# Account permission consent and revocation

## Context

Native account sessions currently deny every permission. This is safe as a baseline but cannot preserve calling. A registered remote page is still potentially compromised: its origin alone does not establish user consent. Electron request/check callbacks have different metadata, and nullable senders cannot establish view identity.

## Options considered

- Automatically grant to registered origins: insufficient user-flow authorization.
- Trust a renderer-supplied gesture or call-state flag: compromised content can forge it.
- Main-owned consent bound to the current account document: explicit user authorization, at the cost of an additional prompt and renewal after reload.

## Proposed decision

Use main-owned, cancel-default consent for camera, microphone and notification permission requests from the selected account. Derive account/origin labels from its registered identity, not page-supplied text. Keep audio, video and notifications separate: a microphone grant does not grant a camera.

Grants are memory-only and bind to the exact registered account view, session, origin and document generation. Main-frame navigation/reload, destruction, crash, account removal or explicit revocation invalidates them. Recheck identity and document generation after asynchronous consent. Already approved scopes may be checked while the account is in the background; new consent requires main-owned foreground eligibility. Concurrent consent requests must be bounded and duplicate requests must not open more dialogs.

Unknown senders, missing or ambiguous media types, wrong sessions/origins, auxiliary views and subframes fail closed. Checks never prompt. Missing consent integration remains deny-all. Raw device errors and renderer text must not reach consent dialogs or public snapshots.

The policy supplies a per-request `AbortSignal` to the main-owned consent provider. Revocation aborts it synchronously as well as invalidating the grant generation; the native dialog must use that signal to close rather than merely ignoring its eventual answer. New consent stays bounded until the old provider settles. Tests prove signal propagation through a real account document navigation and rejection of a late positive answer. Native dialog platform/user-approval qualification remains open.

Hiding an account or switching away cancels its pending consent without clearing existing grants needed for background calling/notifications. A switch back does not revive the cancelled request: the policy rechecks its abort signal before granting. Native targets cover both transitions. Removing the abort-state check produces a late grant after switching away and back and fails the target; restored.

Display capture is a separate source-selection flow, not a camera grant. Unrestricted desktop-source enumeration, legacy capture constraints and nullable notification checks require their own real-runtime evidence before production cutover. Do not infer completion of those paths from the first policy module.

## Consequences

No persistent origin allowlist or generic permission IPC is introduced. OS permission remains an additional gate, not a substitute for account authorization. Tests may inject a consent decision only through main-owned fixtures; no production environment flag may bypass policy.

The local SEC-009 candidate now enables this notification/media composition after baseline and product grant/reload-denial tests. It has not been merged into integration. Finalize platform, authenticated calling and review evidence before treating the proposal as accepted or SEC-009 as complete. Display capture remains a separate unfinished boundary.

The implemented provider uses an owner-bound Electron message box with Cancel as both default and cancellation response. It accepts only canonical registered origins and distinct known scopes, limits itself to one outstanding dialog and forwards document revocation/owner closure to the dialog's abort signal. Labels use the locale catalogue, with English fallback for untranslated additions. Stubbed dialog tests establish options and result handling; the local product fixture verifies composition using real foreground eligibility and test-controlled responses. Real user approval and cross-platform OS behavior remain unqualified.

Linux now has an actual native-dialog cancellation test: the owner-bound API returns denial after automatic abort; omitting the signal causes the unchanged test deadline to expire. Focus eligibility is injected, and no user approval or device grant occurs. This verifies native cancellation, not complete UI/platform qualification. Production activation must also account for intentional consent dialogs in automated product tests rather than introducing a production permission bypass.

## Validation

Sensitive allow/deny tests must cover scope separation, sender/frame/session isolation, cancellation, errors, concurrent requests and revocation during consent. Real fake-device media tests and notification/display checks must prove the API callbacks actually enforce the policy; Windows/macOS/Linux evidence remains required.

### Display boundary finding

The [Electron 43.4.0 permission helper](https://github.com/electron/electron/blob/v43.4.0/shell/browser/web_contents_permission_helper.cc) populates `mediaTypes` only for physical device audio/video. Both legacy desktop capture and modern display capture therefore arrive without these device types. After permission approval, legacy capture uses its requested source directly, whereas modern capture proceeds to `ChooseDisplayMediaDevice`. Inference: allowing empty types merely to reach a modern chooser would also authorize the legacy route. A preload override is not an authorization boundary against compromised content.

The native regression confirms the relevant legacy behavior using only its own fixture window: current policy returns `NotAllowedError` after device consent; removing the empty-types guard returns video. The guard is restored. Preserve this deny test while investigating a native-enforced distinction or secure alternative; no screen-selection design is accepted yet.

## Revisit conditions

Revisit if real-runtime tests show a required flow cannot supply sufficient identity, if legacy display capture bypasses this boundary, or if consent renewal breaks required calling behavior.

## Notification bootstrap evidence

On Linux/Electron 43.4.0, the default-denied account reports `denied` from both `Notification.permission` and `navigator.permissions.query({name: 'notifications'})`. The native baseline `reports the denied notification state through both browser permission interfaces` passes without displaying a notification.

The sibling webapp's `permissionHandlers.ts` initializes its permission store from that browser query. `NotificationRepository.checkPermissionState()` returns false for denied state; `checkPermission()` returns immediately instead of requesting permission. Thus a dialog reachable only from Electron's permission-request callback is insufficient for this webapp flow. This is source/runtime evidence, not a staging E2E result.

Before enabling production grants, resolve an explicit main-owned consent entry point and prove that permission state reaches the webapp after approval and revocation. Do not report `granted` before approval, prompt from permission checks, or weaken sender authorization to bypass the bootstrap problem. Notification renewal after document navigation remains part of this unresolved user-flow design.

An isolated-world `Notification.requestPermission()` updates both existing and fresh page permission queries, even when the page overrides its own request function. However, the page's `PermissionStatus.onchange` did not arrive within the existing two-second native test deadline. The initial immediate event assertion also observed no event. This does not prove the event can never arrive; it rules out relying on the tested listener behavior as completed acceptance.

The sibling webapp already subscribes to `WebAppEvents.NOTIFICATION.PERMISSION_STATE`; its handler normalizes the supplied state, updates the permission store and reevaluates notification eligibility. Use this existing compatibility path after the isolated preload receives an actual browser request result. Proposed composition: main sends a fixed, argument-free notification request to the selected, ready account once per document; an explicit native menu action supports retry. The preload performs the real request and publishes only its validated result through the existing event adapter. No renderer-selected permission/channel, forged grant or replacement browser API is needed. Tests must still prove account selection/readiness, duplicate bounding, cancellation, actual preload execution and state publication before activation.
