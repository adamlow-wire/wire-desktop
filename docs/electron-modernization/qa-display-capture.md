# Display sharing platform QA handoff

Automated qualification uses test-owned frames. It proves the desktop-owned permission boundary, explicit source selection, bounded delivery and lifetime; it does not certify actual OS screen-recording permissions, portals or hardware performance. Record these checks on the release candidate during platform/release qualification.

| Platform check | Required observation |
| --- | --- |
| Windows, macOS and Linux supported sessions | Start an authenticated call, invoke screen sharing from the account and detached call window, select a known test-owned screen/window, and verify the other participant receives that source. Never select customer-sensitive content for QA. |
| Consent and source choice | No capture or remote source enumeration before explicit local choice, including when there is one source. Cancel closes the chooser and produces no stream. |
| OS privacy denial | Deny or revoke screen-recording/portal permission. Sharing fails without exposing another source or bypassing permission. Retry only through a new user-approved flow. |
| Stop and source loss | Stopping sharing in the call, closing the source, and destroying/navigating its parent account end delivery; no separate Stop dialog remains open after selection. A retained clone must also end. |
| Active/background lifetime | An approved active share can continue when switching accounts or minimizing the app; the chooser is hidden once sharing starts. Restore the call and use its Stop control to end delivery. A pending chooser cannot approve a now-ineligible account. |
| Detached call lifetime | PiP uses its own foreground user gesture, retains the correct parent account, and closes when that parent document navigates, crashes or is removed. Another account cannot stop or acquire the flow. |
| Multiple monitors and resizing | Chosen pixels remain correct on the supported scale factors and monitor arrangements, including resizing and static content. Resolution stays within3840×2160 and the existing five-frame-per-second screen-sharing target. |
| Bounded resources | Repeated start/cancel/Stop and a slow receiver do not accumulate capture sources or unbounded frame queues. Record CPU/memory at idle and while sharing on representative hardware. |

Record OS/version, display server or portal, device/scaling, candidate commit/artifact, scenario outcome, and non-secret diagnostics. Actual device screen/system-audio requirements beyond the existing video-only webapp request require a separate product decision. Do not mark these checks passed using synthetic CI evidence.
