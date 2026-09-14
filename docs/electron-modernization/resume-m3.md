# Fresh-session prompt

Copy the following into a new session opened in `/home/sysop/wire/wire-desktop`:

```text
Set an active goal to complete M3 Electron modernization against this repository's authoritative plan. First perform an objective restart audit, then execute the shortest defensible path to closure. This is a solo AI-assisted project: keep changes precise and reviewable, and ask me only for genuinely required access or product decisions.

Read AGENTS.md and its six required project documents in order. Start from docs/electron-modernization/status.md, including the September 14 revalidation and candidate inventory. Inspect actual Git history, worktree, PRs and CI before relying on any recorded claim. Preserve all user changes, wrap/worktrees/wpb-5221-deployment-audit and the recorded MSI artifacts. Do not run broad cleanup, clear:wrap or build:prepare.

Important restart facts to revalidate:
- GitHub access was restored September 14. Integration was d94253c9; draft PR #47 was still at 23fb964b, behind local CAP-001 a4ce662c. Its old build/package checks passed but authenticated E2E was skipped.
- Many prepared changes exist only on separate local candidate branches. Review their deltas and dependencies; do not recreate them or blindly combine their overlapping docs. The permission branch also contains the latest launcher/consent/sidebar harness fixes.
- Linux had no usable session D-Bus/keyring. This blocks local authenticated E2E, not all work or hosted Windows/macOS qualification. Never enable plaintext storage or bypass production permission handlers to obtain a pass.
- September 14 maintainer-approved scope revision: M3 requires automated desktop-owned SSO/E2EI boundary acceptance and a QA handoff. Live Keycloak/OIDC/ACME enrolment, verified-device persistence, restart and renewal move to downstream QA in qa-sso-e2ei.md. Do not provision a live environment for M3 or claim simulated transport proves live compatibility. Keep all security invariants.
- Certificate exception policy (Q-005) and the screen-sharing M3/M4 boundary need evidence-based resolution. Distinguish actual approved requirements from earlier agent assumptions; ask before changing scope or security invariants.

Produce a compact acceptance audit for all nine open M3 items: CAP-001/002/005/006 and SEC-007/008/009/010/013. For each, show what is merged, what is merely local, the missing evidence, dependencies and next executable action. The old ~70% estimate was uncalibrated; do not inherit it. Report criteria/gates completed, or use a clearly defined denominator if reporting percentages.

Prioritize integrating and qualifying the prepared account cutover, including its permission/harness dependencies. Avoid circular PR dependencies, new parallel branches without need, endless isolated tests, repeated failed staging runs or documentation churn. Add sensitive regression tests before behavior changes, prove sensitivity and restore perturbations. Run native GUI suites serially, build TypeScript then bundle before product tests, and never label Linux execution as macOS evidence.

Keep Electron pinned to 43.4.0; do not adopt 44. Use one primary work item per PR and keep integration PR-only. You may publish scoped PRs and self-merge after substantive review and all applicable final-head checks pass. No bypassing checks, treating skips as passes, or using old-head evidence for new code. Keep signed installer/update and independent release review in their assigned later milestones.

Maintain concise status, plan, capability and IPC records as relevant. Continue useful unblocked work, report progress briefly, and do not repeat completed reviews as new progress. If truly blocked, identify the precise input needed and preserve the full goal. Mark M3 complete only after a criterion-by-criterion audit proves every M3 requirement on the final integrated head with durable PR/CI evidence.
```

This is a restart instruction, not evidence that any remaining acceptance gate has passed. The old thread goal was blocked; the new session must establish its own current execution state.
