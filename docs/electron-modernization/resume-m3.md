# Fresh-session prompt

```text
Continue the active goal: close M3, audit production quality and every security acceptance criterion, validate all M3 changes on the final integrated composition, then complete functional M4 before packaging (CAP-003, CAP-004 and applicable development/test portions of TST-005).

Read AGENTS.md and its six required modernization documents in order. Audit actual Git branches, PRs and final-head CI; do not inherit an old percentage or blocked verdict. Integration is PR-only. Preserve user changes, wrap/worktrees/wpb-5221-deployment-audit and protected MSI artifacts. Do not run broad cleanup, clear:wrap or local build:prepare. Push only to fork (adamlow-wire/wire-desktop), not upstream origin.

Current integration is3c734cde after reviewed PR #53. Fifteen M3 items are complete; CAP-005 is qualifying in existing PR #54 on cap/CAP-005-certificate-verification-2026-09-10, using the temporary checkout /tmp/m3-cap005-packaged. Revalidate this inventory before acting. Integrate and qualify existing work; no overlapping branches or subagents.

Maintainer decisions: live SSO/Keycloak/OIDC/ACME environment provisioning and real enrolment/restart/renewal qualification belong to downstream QA, using qa-sso-e2ei.md. M3 accepts automated desktop-owned identity boundaries, not live customer compatibility. Keep that gap explicit. Pinning product behavior stays unchanged: built-in pins, existing native process-wide override until restart, and mandatory Chromium validation. No MDM pinning policy currently exists; do not invent or remove product policy. The broad override remains an independent-review concern.

Keep Electron43.4.0 and all security invariants. Write sensitive characterization tests before behavior changes, perturb to prove failure, then restore. Run native GUI suites serially. Build TypeScript then bundle before product/native tests consuming assets. Linux execution of a macOS-named project is Linux evidence. Use isolated test profiles/keyring; never enable plaintext storage or bypass production permission handlers to get a pass.

Scoped PR publication and self-merge are authorized only after substantive exact-head review, all applicable build/lint/analysis/native-platform checks, full Windows/macOS authenticated E2E and merged report pass. Reconcile dependent PRs with actual integration before final checks; retain failures/retries and never treat a skipped job or old-head evidence as a final pass.

Whole-M3 aggregate tests and coverage were run from completed-M2fe0b86cb:112 Jest,901 main,4 media,4 renderer,38 build-tool cases;3174/3758 changed statements84.46% and840/853 tracked security-policy branches98.48%. The collector needed a bounded16MiB output buffer after an observed ENOBUFS. Revalidate the final composition and record durable PR/CI evidence before declaring M3 complete.

Only after M3 acceptance, complete functional M4. Existing menu/tray/notification and calling code/tests should be qualified rather than replaced unnecessarily. Display source selection must not weaken the existing capture denial. A preflight investigation in /tmp/m4-functional-preflight.md found modern and legacy capture share an empty-media permission shape in Electron43.4; a naive allow can bypass a chooser. Do not claim a design is implemented from those probes. Packaging/signing/installers/updates/migration/rollback and independent release review remain in their assigned later work.

Continue useful unblocked work; ask only for genuinely required access or product decisions. Update status.md before handoff. Mark the overall goal complete only when M3 and the authorized functional M4 scope are demonstrably complete.
```
