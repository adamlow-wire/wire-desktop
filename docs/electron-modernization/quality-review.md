# Integrated quality review and test-completeness execution plan

Status: **active goal; in progress; no completed holistic review or full-coverage claim**. See [execution findings](review-findings.md), [module inventory](review-inventory.csv) and [behavioral traceability](review-traceability.csv). Authoritative work item: TST-006 in [plan.md](plan.md). The maintainer confirmed the [mandatory unsigned handoff gates](plan.md#current-goal-close-mandatory-unsigned-review-handoff) on September22. This execution plan preserves accepted M3/functional M4 evidence. [Current status](status.md) owns branch/commit evidence and the next executable task.

## Review-first batch backlog — September 25, 2026

The maintainer asked to finish the upstream catch-up and integrated review, collect their findings, then implement the accepted items as a batch. **Pause further source fixes and fork pushes while building this list.** Read-only review, existing CI observation, and local documentation may continue. This is a provisional list, not a completed holistic review or a change in the mandatory gates below. Use the existing plan work items; these row labels are review handles, not new work items or PR requests.

The upstream comparison is `6f9b6a99..5504073a` on `wireapp/wire-desktop` `dev`, verified unchanged with `git ls-remote` on September 25. [The source-level delta](upstream-delta-2026-09-24.md) covers 27 commits / 12 merged PRs. Electron 43.4.0 stays pinned for this handoff; upstream `dev`'s Electron 38.8.6 is not a merge target. Statuses below describe our candidate, not acceptance of upstream binaries.

| Handle | Upstream change | Current disposition | Batch decision / existing owner |
| --- | --- | --- | --- |
| U1 | [#9739/#9745](https://github.com/wireapp/wire-desktop/pull/9745) Windows App-lock requires explicit Wire policy | Source already carried; native enterprise-policy readback still not proved | Verify current Windows policy contract under CAP-005; no duplicate port. Mandatory handoff evidence. |
| U2 | [#9738](https://github.com/wireapp/wire-desktop/pull/9738) optional regional locale | Source already carried through a main-owned bridge | Verify native/webapp consumer behavior under CAP-001/CAP-005; no unrestricted synchronous IPC port. Mandatory capability review. |
| U3 | [#9743](https://github.com/wireapp/wire-desktop/pull/9743) log retention 100 to 500 MiB | Not carried; privacy/disk and seven-day behavior tradeoff | Decide target retention and prove active-file/order/resource tests before any change, CAP-001/TST-006. Product choice, not an automatic security fix. |
| U4 | [#9748](https://github.com/wireapp/wire-desktop/pull/9748) Open Graph dependency/result change | Do not copy its `image.url` shape: reviewed webapp consumer reads `image.data` | Reconfirm current consumer/version and preserve the bounded candidate fetch/parser contract, SEC-012/ELC-003. |
| U5 | [#9750/#9751](https://github.com/wireapp/wire-desktop/pull/9751) Windows signing `smctl` flags and verification order | Not carried; current source has old flags | Port fail-closed logic and static tests before signed Windows qualification, then validate on Wire's signing worker, SEC-011/PKG-002. Actual signing is downstream M5. |
| U6 | [#9752](https://github.com/wireapp/wire-desktop/pull/9752) Windows Alt menu double-toggle | Not carried | Characterize current main-owned account-view behavior and port if reproduced, CAP-004. Functional parity, not a presumed security blocker. |
| U7 | [#9636](https://github.com/wireapp/wire-desktop/pull/9636) translation updates | Not carried | Review localization diff for product parity in a later upstream sync, CAP-004. No security-boundary dependency identified. |
| U8 | [#9744](https://github.com/wireapp/wire-desktop/pull/9744), [#9741](https://github.com/wireapp/wire-desktop/pull/9741), [#9742](https://github.com/wireapp/wire-desktop/pull/9742) CI environment, Linux Jenkins release route and update bot | Not carried wholesale | Reconcile test/release ownership and active dependency-update path under TST-005/PKG-002/ELC-003; do not alter production backend selection from a test-only change. Release pipeline and governance items may be deferred with owners. |

| Handle | Internal review finding / evidence gap | Current disposition | Batch decision / existing owner |
| --- | --- | --- | --- |
| R1 | F-012 account-owned ciphertext and existing-profile compatibility | **High, no accepted implementation**; product choice between existing-profile migration and fresh-only candidate remains open | Decide explicit contract, then characterize/migrate or fail closed with native key-store and cross-account tests, SEC-003/PKG-003. Mandatory before unsigned handoff. |
| R2 | Whole-delta code/test/security audit and coverage | 556 changed paths accounted for, but 123 source, 238 provenance and 339 coverage cells remain exactly pending, plus partial cells; 97 pending source rows are tests/fixtures | Finish trust-boundary/integration review, DCP/INV/IPC traceability, test fidelity, baseline provenance and per-module coverage dispositions before freezing the implementation batch, TST-006. This is the principal unfinished review work. |
| R3 | Prior high findings F-003/F-004/F-005/F-006/F-008/F-009/F-010/F-011/F-013/F-017/F-021 plus F-035/F-036 | Most have source corrections already composed; historical discovery entries can say “open” even where source exists | Reconcile each fix against the exact candidate, re-review interactions and identify only missing implementation or final native/package evidence under existing CAP/SEC/PKG owners. Do not create repeat fixes from stale text. |
| R4 | F-037 image-save bounds and F-041 login-helper identity | Separately failing baselines and local fixes are on PR #72 head `93ff2fe2`; seven image and three inert login cases pass. Exact-head native/backend fidelity still unproven | Treat as validation/re-review, not new feature work. Check real image-save behavior and full authenticated E2E before closing SEC-008/TST-006. |
| R5 | F-040 deployment artifact selection and release-draft CLI | S3 exact-path/version selection is composed and passed prior all-platform package CI. `github-draft-cli.ts` creates a remote draft before scanning files and selects by extension only; no release incident or failing test yet | Reproduce the draft CLI failure using inert API/filesystem tests, then decide a fail-closed fix under PKG-002 before release-tool handoff. Never test by creating an upstream draft. |
| R6 | PR #72 exact-head CI and historical flaky attempts | `bce6f775` had clean 76/76 first-attempt E2E on each OS and all packages. Current `93ff2fe2` Build/Test, CodeQL and package passed; lint failed on markdown formatting, fixed only in local `5320dcae`; E2E still running at this snapshot | Preserve historical macOS native quit / API-403 evidence, inspect current attempt-level results, avoid speculative fixture changes, then run one final composed head after the accepted batch, PKG-001/TST-005. |
| R7 | ELC-003 shipped graph and packaged behavior | Prior Windows/macOS/Linux ASAR graphs and authorized npm screening found no unaccepted high/critical match; local source changed since the inspected artifacts | Reconcile final exact-head package names/versions, artifact identity/hashes, installed smoke and advisory freshness. Keep actual signed/post-sign checks for M5. |
| R8 | Review-ready documentation and QA handoff | Current status prose predates the latest push; lint formatting fix is local only. External OS/hardware, live SSO/E2EI, released migration, signing and independent review remain unrun | Refresh status, capability/coverage gaps and reproducible procedures only after list/fixes/final CI; distinguish unsigned engineering handoff from downstream release acceptance, GOV-002/TST-006. |

**Review queue detail:** Of the 123 exactly pending source-review cells, 97 are tests/fixtures, 25 are documentation and one is `yarn.lock`; application source has bounded notes but still needs integrated trust-boundary re-review. The behavioral ledger has 64 rows, with 43 implementation mappings marked `not yet traced`. Review security IPC tests (22 pending), network/lib tests (9), calling/display tests (6) and preload tests (6) first, followed by account/SSO, package/CI and remaining product paths. These counts set review order; they do not turn any unreviewed test into evidence.

**Batch sequence:** (1) finish read-only code, test and upstream review; (2) freeze this list with severity, evidence, owner and required-versus-deferred disposition; (3) implement accepted mandatory items in scoped, baseline-first commits without piecemeal PR pushes; (4) compose and run one exact-head Windows/macOS/Linux validation set; (5) re-review the final tree and publish the unsigned engineering handoff. Do not treat a clean CI run as closure for R1/R2 or accept a later successful retry as diagnosis of an earlier failure.

## September 26 execution note

The maintainer explicitly prioritized permission and screen-share dialog improvements and a new Windows preview ZIP. The review-first pause in the September 25 batch sequence no longer prevents these two scoped UX fixes or PR-only qualification/integration. This does not close the upstream catch-up, source-review, test-provenance, coverage, compatibility or release gates. Record the new CAP-003/SEC-009 paths in the original-baseline inventory and continue the holistic review after the preview is available.

## Current goal

Prepare the modernization integration branch for Wire engineering review: complete a holistic production-code/security review and baseline-before-refactor audit; achieve the fullest practical, meaningful automated coverage of retained functionality and changed behavior; fix and re-review findings; close ELC-003, unsigned PKG-001 and packaged TST-005; qualify the final composed candidate on Windows/macOS/Linux; and deliver reproducible tests, unsigned artifacts and an explicit residual QA/release ledger. Preserve Electron 43.4.0, all invariants, existing product decisions, user work and PR-only integration. Actual signing/notarization validation is for Wire after review and remains a release gate. Preparing the handoff does not authorize contacting Wire, publishing upstream or releasing.

## 1. Reconstruct scope and evidence before changing code

- Read AGENTS.md and its six documents in order; verify actual branches, integration, protections and CI against status.md. The review plan was integrated through PR61; continue the existing ledgers and remediation branches rather than restarting them.
- Establish and record the original pre-modernization source SHA from baseline/governance/history, plus final candidate SHA. Inventory the entire modernization diff from that baseline, not merely M3 since M2 or the last PR. Include retained dependencies and unchanged code where changed integration depends on it.
- Re-run the exact path/status accounting check in [inventory reconciliation](inventory-reconciliation.md) whenever the composed target changes; a matching inventory does not close review.
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
