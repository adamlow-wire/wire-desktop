---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-14
milestone: M3
active_work_item: CAP-006
state: qualifying-existing-lifecycle-candidate
integration_branch: integration/electron-modernization
integration_head_commit: 4f04a8a0700d388a9b1199e5905df5f2bc70b72e
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
fork_url: https://github.com/adamlow-wire/wire-desktop
active_branch: cap/CAP-006-second-instance-2026-09-10
next_work_item: CAP-005
blockers:
  - live-sso-e2ei-provider-configuration-pending
  - certificate-exception-policy-pending
---

# Current project status

## Current execution

Lifecycle PR #51 is reconciled with protocol candidate4f867021 while its final checks run. Preflightba38c1a7 passes build/lint/analysis and macOS/Linux native/package gates, but Windows consistently fails the actual second-process delivery assertion across all three attempts: the secondary exits0 while the selected account remains on devices instead of account preferences. This is a functional failure, not a timing-budget failure. Preserve exact delivery/exit/account-count assertions and diagnose the actual Windows event/argv before changing behavior. Evidence [34852932003](https://github.com/adamlow-wire/wire-desktop/actions/runs/34852932003), Windows job104005141428, artifact10352651247, `/tmp/m3-ba38-windows-native.log`.

Protected integration is `4f04a8a0700d388a9b1199e5905df5f2bc70b72e`, after reviewed PR #49 passed every final-head gate. The exact head66f9d9db passes build/coverage, lint, analysis, Windows/macOS/Linux native/package qualification and authenticated Windows/macOS E2E/report:43 initial passes per platform, no retries, skips or worker errors. Native macOS arm64 packaging verifies architecture, preserved fuses and ad-hoc seal, then passes ordinary and managed/authenticated-proxy startup. Durable links and the substantive review are in [PR #49](https://github.com/adamlow-wire/wire-desktop/pull/49).
