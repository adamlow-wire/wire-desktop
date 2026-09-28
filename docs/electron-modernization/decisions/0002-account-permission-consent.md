---
decision_id: DEC-009
adr: 0002
status: accepted
date: 2026-09-14
owners: [adamlow-wire]
work_items: [SEC-009, CAP-003]
invariants: [INV-003, INV-004, INV-006, INV-010]
supersedes: []
---

# Account permission consent and revocation

## Context and alternatives

The initial deny-all native session baseline could not preserve calling or the webapp notification bootstrap. Remote content remains potentially compromised. A registered origin, renderer-supplied gesture or page call state alone cannot establish consent. Main-owned consent provides an explicit user authorization boundary.

## Accepted M3 decision

Use an owner-bound native message box with Cancel as default and cancellation response for notification, microphone and camera permission requests. Main derives canonical account/origin labels and separate known scopes from registered identity, with localized catalogue strings and English fallback. Limit native dialogs to one outstanding request. No renderer-selected grant endpoint or production auto-approval flag exists.

Memory-only grants bind the exact view, account, session, origin, permission type and document generation. Navigation/reload, removal, destruction, crash or explicit revocation invalidates them. Recheck all authority after asynchronous consent. Checks never prompt. Unknown senders, ambiguous/empty media types, wrong origins/sessions, auxiliary views and subframes fail closed.

Revocation aborts the native dialog synchronously through its `AbortSignal`; a late positive answer cannot grant permission. Hiding/switching cancels pending consent while preserving already approved scopes needed for background calls and notifications. Returning to the account does not revive an aborted request. Raw device errors and page-supplied text do not enter consent dialogs or public snapshots.

The webapp initially observes default-denied notification state and therefore does not request permission itself. Main sends a fixed, argument-free request to the selected, ready account once per document, with an explicit localized native-menu retry. The isolated preload performs the browser request and publishes only its validated result through the existing `WebAppEvents.NOTIFICATION.PERMISSION_STATE` adapter. Authorization still governs account readiness events; page overrides cannot forge the isolated browser result. No grant is reported before consent.

Display capture and desktop-thumbnail enumeration remain denied. Electron 43.4.0 shares a permission callback between legacy capture and modern source choice; allowing empty media types can admit legacy capture without a chooser. Native sensitivity tests demonstrate that limitation and preserve denial, including after device consent. No screen-selection design is accepted here. Enabling display sharing remains CAP-003/M4 under the authoritative register.

## September 26 presentation amendment

The maintainer requested clearer permission reasons and a modern Wire-styled consent box. A main-owned, fixed local modal replaces the native message box for notification, microphone and camera consent. The canonical requesting origin and each requested scope remain visible; each scope now explains its purpose in plain language. The local document has a separate in-memory session, sandboxed isolated preload, no remote navigation, popups, downloads, ambient account credentials or general account capabilities. Main accepts one boolean decision only from that modal's exact main frame, document URL and session; Cancel, close, abort, lost owner and malformed/foreign decisions deny. The source account still cannot grant itself permission, and the original memory-only grant/revocation policy is unchanged. An accepted modal answer still requires the account to regain foreground eligibility before the policy can grant access. The earlier native-message-box evidence below remains historical; the new local modal requires exact-head native/platform qualification before this UX follow-up is accepted.

## Qualification and consequences

[PR #48](https://github.com/adamlow-wire/wire-desktop/pull/48) supplies the reviewed permission dependency. [PR #47](https://github.com/adamlow-wire/wire-desktop/pull/47) integrates it as `683ac9af` after final-head [native/package qualification on Windows/macOS/Linux](https://github.com/adamlow-wire/wire-desktop/actions/runs/34833701114) and [authenticated Windows/macOS E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34834177940) pass. Native tests cover cancel-default options, real dialog cancellation, per-scope device allow/deny, document/switch revocation and cross-account/subframe denial. Product fixtures and authenticated calling exercise the composition. Both E2E platforms have 39 initial passes/one login retry, no skips or teardown errors.

Removing abort-state checks or the thumbnail capability restriction fails the corresponding targets; restored tests pass. Enumeration sensitivity uses an inert counter and captures no host screen. Synthetic devices and test-owned consent decisions are limited to test fixtures. OS permissions remain an additional gate. No persistent origin allowlist or generic permission IPC is introduced. Hardware/release experience and enabling display remain in their assigned later capability/release gates.

This is the authorized solo-maintainer/Codex review model, not an independent release review. Revisit if a required flow cannot establish identity, legacy capture bypasses denial, or consent renewal breaks calling/notification behavior. Earlier investigation and source links remain in the ADR history.
