# Integrated quality review and test-completeness execution plan

Status: **active goal; in progress; no completed holistic review or full-coverage claim**. See [execution findings](review-findings.md), [module inventory](review-inventory.csv) and [behavioral traceability](review-traceability.csv). Authoritative work item: TST-006 in [plan.md](plan.md). The maintainer confirmed the [mandatory unsigned handoff gates](plan.md#current-goal-close-mandatory-unsigned-review-handoff) on September22. This execution plan preserves accepted M3/functional M4 evidence. [Current status](status.md) owns branch/commit evidence and the next executable task.

## Current goal

Prepare the modernization integration branch for Wire engineering review: complete a holistic production-code/security review and baseline-before-refactor audit; achieve the fullest practical, meaningful automated coverage of retained functionality and changed behavior; fix and re-review findings; close ELC-003, unsigned PKG-001 and packaged TST-005; qualify the final composed candidate on Windows/macOS/Linux; and deliver reproducible tests, unsigned artifacts and an explicit residual QA/release ledger. Preserve Electron 43.4.0, all invariants, existing product decisions, user work and PR-only integration. Actual signing/notarization validation is for Wire after review and remains a release gate. Preparing the handoff does not authorize contacting Wire, publishing upstream or releasing.

## 1. Reconstruct scope and evidence before changing code

- Read AGENTS.md and its six documents in order; verify actual branches, integration, protections and CI against status.md. The review plan was integrated through PR61; continue the existing ledgers and remediation branches rather than restarting them.
- Establish and record the original pre-modernization source SHA from baseline/governance/history, plus final candidate SHA. Inventory the entire modernization diff from that baseline, not merely M3 since M2 or the last PR. Include retained dependencies and unchanged code where changed integration depends on it.
- Create a compact tracked review ledger. Account for every changed production module, preload, IPC, configuration, build/packaging script and CI workflow, and every retained DCP/INV. Group related files only with explicit membership. Record review status and findings; test counts alone do not establish review coverage.
- Build behavioral traceability with columns: capability/invariant/IPC ID; retained contract; implementation; baseline test/commit and observed original result; implementation commit; present assertion; sensitivity result; actual platforms/CI; uncovered behavior and owner. Use `not evidenced` when provenance is missing. A retrospective legacy run is useful but does not prove the test predated the refactor.
- Keep three categories distinct: passing legacy characterization, initially failing security-target tests, and regression tests added after discovering a defect. Identify deleted or weakened assertions and link any approved behavior change. Do not preserve insecure behavior merely to achieve compatibility.

## 2. Review the complete implementation and the tests

Review authority and trust transitions, IPC schemas and sender/frame/session ownership, remote/preload exposure, navigation/protocols, permissions, network/TLS, credentials/logging, storage/path handling and account isolation. Follow asynchronous paths through cancellation, stale callbacks, destruction/crash, retries, concurrent accounts, rollback and cleanup. Check resource bounds, capture performance assumptions, dependency risk, maintainability and obsolete/dead code. Refactor only when it addresses an evidenced finding; avoid unrelated cleanup.

Review tests as code: their real observable assertions, fixture fidelity, mocks, real Electron coverage, permission hooks, generated/cached artifacts, collection omissions, platform labels, teardown, skip/quarantine and retry semantics. Verify each mandatory workflow executes its intended tests and consumes the exact built artifact. Preserve the Windows false-success smoke incident and cancellation timing failures as explicit audit inputs. A green report or successful retry is not proof of execution or diagnosis.

Track each finding with severity, affected paths/contract, reproduction, owning existing work item, remediation commit and retest. Block handoff for unresolved critical/high defects, known security/data-loss failures or reachable untested paths with those consequences. Lower-risk residual findings require explicit rationale, owner and follow-up; risk acceptance is never inferred from elapsed time.

## 3. Close coverage gaps with meaningful tests

Produce fresh coverage only through hosted CI or genuinely isolated execution. Report denominators and per-module statements, branches and functions for the full instrumentable production scope and the full modernization delta. Audit JavaScript/tooling and non-instrumented native/configuration behavior separately. Include all security-relevant changed modules in the review, not only the collector's existing policy-file subset. Validate merged main/renderer counters and absent-file detection; do not present E2E counts as instrumented coverage unless actually collected.

Aim for all reachable in-scope behavior and decision paths. Existing 80% changed-statement/90% selected-security-branch gates are floors, not the goal. Do not invent a higher aggregate threshold before auditing the denominator, and do not lower existing gates. Add tests in risk order:

1. Authorization, malformed input, stale/foreign account state and absence of privileged side effects.
2. Persistence, partial failure, cancellation, concurrency, recovery and owned-resource cleanup.
3. Retained product contracts and platform differences; real integration where mocks cannot prove the boundary.
4. Remaining reachable decision/error paths, including build/packaging/CI failure propagation.

For established behavior, add passing characterization before changing implementation, prove sensitivity by temporary perturbation, restore and preferably commit separately. For defects/security targets, record the failing original result before the fix. Keep critical assertions intact. Use deterministic cases and bounded fault injection; avoid tests that merely mirror implementation, no-op mocks or brittle line-count targets.

Every residual uncovered location/behavior must have one of these evidenced dispositions:

| Disposition | Required treatment |
| --- | --- |
| Reachable and automatable | Add a meaningful test before closure; inconvenience or low aggregate impact is not a justification to omit it. |
| Unreachable/dead production path | Prove unreachability, then remove safely under its owner or explain why it must remain. An ignore directive alone is not evidence. |
| Generated/third-party code | Identify origin and exclusion boundary; test our integration contract. Do not exclude maintained application code as generated. |
| Requires external OS/hardware/service/signing environment | Exhaust practical deterministic boundary tests, provide a runnable procedure, exact expected results and intended owner; mark external result unrun. |

Close the ledger only after every entry is tested or has a reviewed, specific disposition. Do not claim 100% product coverage from 100% instrumented counters, or describe externally deferred cases as passed. Missing baseline history remains disclosed even after present behavior is fully tested.

## 4. Complete unsigned packaging and the test handoff

Use ELC-003 for dependency audit/remediation, PKG-001 for Windows Squirrel/MSI, macOS and Linux builds, and TST-005 for actual packaged smoke and enforced CI. Review existing supported OS/architecture requirements first; ask only if a required product decision cannot be inferred. Electron remains 43.4.0; no implicit Electron 44/ia32 decision.

Require repeatable clean builds with pinned inputs, required artifact existence/identity, package manifests and hashes, actual startup and security smoke, native integration and fail-closed build errors. State whether bit-for-bit reproducibility was established; reproducible procedures alone do not imply identical signed/archive bytes. Validate applicable effective fuse/integrity settings on unsigned artifacts and review production pipeline order under SEC-011. Do not close its signed-binary criteria.

Prepare/run safe unsigned installer/update-routing and migration fixtures under PKG-002/PKG-003 where feasible, preserving the protected MSI worktree. Keep those M5 items open for real released-installation, signed updates and rollback qualification. Tests must use disposable CI machines/profiles, never the maintainer's installed Wire or active desktop. Package tests must identify the actual artifact they launch, and completion gates must fail if execution is skipped.

The handoff includes test commands, environment/toolchain requirements, fixture setup and cleanup, expected counts/collection checks, exact commit/artifact hashes, CI links, sanitized failure diagnostics and rerun instructions. Secrets stay outside source and reports. Provide Wire with signing/notarization/entitlement/post-sign integrity and signed updater test procedures; maintain the existing display and Keycloak/E2EI QA checklists. Intended external owners are not confirmed appointments.

## 5. Final composed review and acceptance

After fixes and packaging changes, re-review affected code plus integration interactions; rerun the required complete tests/coverage/platform package and E2E/report gates on the final composed head. Compare against the original modernization baseline and the accepted functional checkpoint, not only the last small PR. Retain failures/retries; investigate unexplained failures rather than rerunning until green. Check exact CodeQL results, artifact/source identity, protected checks, unresolved threads and tested/reviewed/merged tree equality before each authorized SHA-guarded self-merge.

TST-006 closes only with the completed review/provenance/coverage ledgers, required remediations, meaningful test sensitivity, final-head evidence and explicit external gaps. M4 closes only when its updated unsigned PKG-001/TST-005 criteria also pass. Publish a concise review-ready handoff package locally/in the fork; upstream communication requires separate authorization. M5/INV-009, independent REL-001 review, live customer compatibility and M6 rollout remain unclaimed.

## Autonomy and stop conditions

Proceed through read-only audit, scoped fixes/tests, fork PR publication and qualified integration merges without repeatedly requesting permission. No subagents. No native Electron or GUI Playwright tests on the shared display, broad cleanup, local build:prepare/clear:wrap, or changes to protected MSI/user artifacts. Do not manually dispatch notification-sending E2E workflows. Preserve native secure storage, consent, pinning and mandatory Chromium validation; no MDM pinning policy exists to invent.

Ask only for unavailable required access or product decisions, continuing independent work. Signing credentials, a live customer environment and an independent reviewer are not prerequisites for this explicitly unsigned engineering handoff. They remain necessary external release qualifications. Do not declare the goal complete while reachable automatable gaps or required handoff findings remain open.
