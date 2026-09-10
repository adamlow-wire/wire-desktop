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

The policy supplies a per-request `AbortSignal` to the main-owned consent provider. Revocation aborts it synchronously as well as invalidating the grant generation; the native dialog must use that signal to close rather than merely ignoring its eventual answer. New consent stays bounded until the old provider settles. Tests prove signal propagation through a real account document navigation and rejection of a late positive answer. The native dialog itself remains to be integrated and qualified.

Display capture is a separate source-selection flow, not a camera grant. Unrestricted desktop-source enumeration, legacy capture constraints and nullable notification checks require their own real-runtime evidence before production cutover. Do not infer completion of those paths from the first policy module.

## Consequences

No persistent origin allowlist or generic permission IPC is introduced. OS permission remains an additional gate, not a substitute for account authorization. Tests may inject a consent decision only through main-owned fixtures; no production environment flag may bypass policy.

This proposal is not production-enabled. Finalize the dialog/grant lifecycle through SEC-009 review and tests before changing the default handlers.

The implemented provider uses an owner-bound Electron message box with Cancel as both default and cancellation response. It accepts only canonical registered origins and distinct known scopes, limits itself to one outstanding dialog and forwards document revocation/owner closure to the dialog's abort signal. Labels use the locale catalogue, with English fallback for untranslated additions. Stubbed dialog tests establish options and result handling; real native UI behavior and production composition are not yet qualified.

## Validation

Sensitive allow/deny tests must cover scope separation, sender/frame/session isolation, cancellation, errors, concurrent requests and revocation during consent. Real fake-device media tests and notification/display checks must prove the API callbacks actually enforce the policy; Windows/macOS/Linux evidence remains required.

## Revisit conditions

Revisit if real-runtime tests show a required flow cannot supply sufficient identity, if legacy display capture bypasses this boundary, or if consent renewal breaks required calling behavior.

## Notification bootstrap evidence

On Linux/Electron 43.4.0, the default-denied account reports `denied` from both `Notification.permission` and `navigator.permissions.query({name: 'notifications'})`. The native baseline `reports the denied notification state through both browser permission interfaces` passes without displaying a notification.

The sibling webapp's `permissionHandlers.ts` initializes its permission store from that browser query. `NotificationRepository.checkPermissionState()` returns false for denied state; `checkPermission()` returns immediately instead of requesting permission. Thus a dialog reachable only from Electron's permission-request callback is insufficient for this webapp flow. This is source/runtime evidence, not a staging E2E result.

Before enabling production grants, resolve an explicit main-owned consent entry point and prove that permission state reaches the webapp after approval and revocation. Do not report `granted` before approval, prompt from permission checks, or weaken sender authorization to bypass the bootstrap problem. Notification renewal after document navigation remains part of this unresolved user-flow design.
