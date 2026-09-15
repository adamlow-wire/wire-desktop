---
decision_id: DEC-011
adr: 0004
status: proposed
date: 2026-09-15
owners: [Desktop maintainer, Security]
work_items: [CAP-003]
invariants: [INV-001, INV-002, INV-003, INV-004, INV-005, INV-006, INV-010]
supersedes: []
---

# Display capture through a trusted local source chooser

## Context

Electron 43.4.0 sends both modern display requests and legacy desktop-video requests through a `media` permission request with empty `mediaTypes`. Allowing that shape for an account would also admit legacy capture outside the display-source handler. The current account policy correctly denies it. An override in a remote page's JavaScript cannot be the security boundary.

The current Wire webapp supports `getDisplayMedia` when the legacy `desktopCapturer` global is absent, including from its detached call window. Its screen-sharing request is video-only at five frames per second.

## Options considered

- Grant empty-media permission to an account and rely on the modern display handler: rejected because the legacy request bypasses that handler.
- Let a main-world shim police legacy requests: rejected because potentially compromised remote content must not control the permission boundary.
- Capture only inside a fixed trusted local document and relay the approved video: selected. This keeps source authority away from account and PiP JavaScript, at the cost of bounded frame-copy overhead.

## Decision

Main authorizes the requesting account or parent-bound PiP document, then creates an isolated local chooser. The user explicitly selects a source, even when only one exists. Only this fixed broker document may obtain a one-use display grant for that main-selected source. Its session has no remote navigation, popups, ambient account credentials or general account capabilities. A visible Stop control owns capture lifetime.

Remote account and PiP sessions continue denying native empty-media/legacy/display requests. They receive a real generated video stream through a fixed compatibility adapter and main-created ports bound to the exact requestor. Source lists, thumbnails and native source IDs never reach them. Bridge version 2 removes the legacy enumeration global and production enumeration endpoint.

The relay admits one bounded RGBA frame awaiting acknowledgement, with explicit dimension, byte, frame-rate and time limits. Port messages cannot choose or switch sources. Main owns flow identifiers, per-owner quotas, document revalidation, cancellation and disposal. Initial requests require foreground eligibility; already-active calls may survive an account switch. Parent navigation/destruction, broker failure, source ending or explicit Stop revokes delivery. Closing or aborting the consumer writer ends cloned tracks as well as the original.

## Consequences

This preserves the webapp's existing display-media path without exposing native capture authority to remote content. The broker adds memory/copy cost and must enforce backpressure and bounded resolution. System screen-recording permissions and portal consent remain mandatory. Actual source selection, OS privacy denial, Stop, monitor scaling and resource checks are recorded in the [platform QA handoff](../qa-display-capture.md). This decision does not add system-audio capture, which the existing webapp screen request does not request.

## Validation

Before acceptance, require actual native allow/deny and ownership tests, hostile legacy-request denial, bounded frame validation/backpressure, cancellation/late-answer cleanup, PiP parent-lifetime checks and a real sandboxed product fixture. Synthetic test-owned frames can exercise the modern display handler and complete relay without capturing the host desktop. Supported-platform CI and existing authenticated call E2E must pass on the final head. Real OS capture/privacy/portal behavior remains explicit platform QA evidence, never inferred from a synthetic frame.

Linux preflight on the installed runtime demonstrated modern capture in an exact secure custom-scheme broker, activation through its fixed context bridge, transfer across isolated sessions, native account display denial, and original/clone ending on Stop. Those probes justify implementation; they do not qualify an unimplemented production chooser.

## Revisit conditions

Revisit if Electron supplies a native permission boundary that safely distinguishes legacy capture, transferable tracks become supported across these isolated sessions, relay performance fails the bounded target, or required display/audio capabilities change.
