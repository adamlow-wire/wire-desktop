# Logging boundary review — September 22

Scope: TST-006 review of six modules and their tests at detached composed `a795057b`, tree `0af6b5573db1240cd1705463c3e3c1bdaa741d78`. This is source/provenance and test-sensitivity evidence. It does not close CAP-004, the logging subsystem review or native platform qualification. No production change was made.

## Source and coverage disposition

| Module | Source review | Test evidence and remaining gaps |
| --- | --- | --- |
| `logFiles` | Reviewed extension-only recursive discovery; child symlink traversal disabled; trusted root and no concurrent path substitution assumed. | Real owned-filesystem discovery passes; enabling symlink traversal fails 1 assertion. Root-symlink and concurrent replacement resistance not established. |
| `logDirectoryAncestors` | Reviewed lexical containment and deepest-first parent enumeration; root/outside paths excluded; no filesystem identity guarantee. | 2 lexical boundary cases pass; adding root to returned ancestors fails both. Windows path semantics still require native platform gate. |
| `logDirectoryCleanup` | Reviewed lstat-derived directory/symlink gate; nonrecursive rmdir; expected missing/nonempty races treated as success; other errors retained. | Unexpected-error identity assertion and owned-filesystem symlink/nonempty controls pass; swallowing unexpected error fails 1 target. Direct ENOENT/EEXIST/non-directory and ancestor-wrapper stop-on-error targets remain missing. |
| `logRetention` | Reviewed strict age cutoff then oldest-first size pruning; active files and links excluded from deletion; active bytes may keep total above target. | 4 planner cases pass; removing active-file exclusion fails 1 target. Mixed expiry-plus-size dedup and link-byte exclusion deserve explicit targets; policy and metadata are internal trusted inputs. |
| `logCleanup` | Reviewed serial metadata/removal, failure continuation, deepest-first empty parents and concurrent-run coalescing; production unlink/rmdir adapters inspected. | 5 cases pass including real directory preservation; omitting file removal fails 3 targets. Discovery/stat/directory failure continuation and rerun-after-failure need direct assertions; raw filesystem diagnostics remain separate review scope. |
| `logMaintenance` | Reviewed synchronous admission via fireAndForgetInvoker, active-write exclusion, serial maintenance and finally release; queued operations are internal callers. | 4 ordering/concurrency/recovery cases pass; bypassing active-write guard fails 1 target. Rejected-write release and repeated failures need direct assertions; total admission bound belongs to writer review. |

`logDirectoryAncestors` is a lexical boundary, not protection against a local process replacing an ancestor with a symlink between discovery and filesystem access. `logFiles` disables following discovered child symlinks; it does not validate a symlink used as the configured root. The review does not expand either claim into an adversarial filesystem guarantee. Review log-root construction/account-path validation and writer admission separately before accepting the subsystem. No remote caller or new privileged capability is introduced by these helpers.

The maintenance implementation relies on the production `fireAndForgetInvoker` invoking its async callback synchronously before tracking its promise; that source was inspected. It acquires the active-write count before the first await. Its operation queues are internal, so this review does not establish the separate writer's memory/admission bound. Cleanup reports raw filesystem paths/errors through its supplied callback; diagnostic confidentiality needs its own disposition.

## Provenance

- `logFiles`: 19268e65 source/test together; test adjusted d0510140; no separate preimplementation baseline established.
- `logDirectoryAncestors`: dce4c285 source/test together; no separate preimplementation baseline established.
- `logDirectoryCleanup`: dce4c285 source/test together; no separate preimplementation baseline established.
- `logRetention`: d0510140 source/test together; no separate preimplementation baseline established.
- `logCleanup`: d0510140 source/test together; dce4c285 adds ancestor cleanup and tests; no separate preimplementation baseline established.
- `logMaintenance`: 1781c337 source/test together; no separate preimplementation baseline established.

Source/test history was inspected with `git log --reverse --format='%h %s' -- <path>` and exact target blobs with `git rev-parse a795057b:<path>`. The twelve blob IDs and histories are retained in `/tmp/tst006-log-boundary-provenance.json`. Same-commit tests are not represented as prior failing characterizations. The sensitivity checks below establish current assertion relevance, not historical test-first sequencing.

## Validation and sensitivity

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/logging/{logFiles,logDirectoryAncestors,logDirectoryCleanup,logRetention,logCleanup,logMaintenance}.test.main.ts
```

On the exact composed target, the initial17 cases pass. Six temporary source perturbations each fail observable assertions: symlink traversal1, root inclusion2, swallowed directory error1, active-file deletion1, omitted cleanup3, and maintenance overlapping an active write1. No result relies on a timeout. Every source file is restored in `finally`; the final17 cases pass and the checkout is clean. No Electron import, native process, user files or hosted job is involved.

Evidence: `/tmp/tst006-log-boundary-baseline.log`, `/tmp/tst006-log-boundary-<module>-sensitivity.log`, `/tmp/tst006-log-boundary-restored.log`; mutation driver `/tmp/tst006-log-boundary-sensitivity.py`. These are local evidence, not hosted final-head acceptance. No line/branch percentage was collected or claimed.

The inventory now replaces twelve entirely pending rows with these explicit dispositions. Exact remaining pending cells:357 source review,387 provenance,397 coverage. Nonempty rows still contain gaps and are not automatically accepted. The485-path accounting check against the original baseline and a795057b still passes. Later diagnostic changes on the report branch remain outside this frozen target.

Next executable work: add direct error/recovery tests for directory cleanup and cleanup orchestration, then review root/account-directory construction and bounded writer admission. Keep any confirmed implementation defect under its existing CAP-004/CAP-001 work item with a separate regression baseline; do not silently turn these review gaps into claimed fixes.

## Follow-up characterization baseline — 7b7f09e5

The scoped TST-006 branch adds15 tests to the existing directory/cleanup suites, without production changes. `7b7f09e5` is a separate test-only commit. All32 cases across the six reviewed modules pass after all perturbations are restored. This is later characterization of established behavior, not evidence that the original implementation was written after these tests.

New directory targets refuse symbolic links and non-directories; distinguish ENOENT/ENOTEMPTY/EEXIST from EACCES at inspection/removal; preserve unexpected error identity; stop ancestor deletion after failure; and allow a subsequent successful deepest-first attempt without deleting the root. New orchestration targets retry discovery after a failed run on the same cleanup instance, skip an uninspectable file while deleting an independently inspected one, and continue other parent cleanup after either returned or thrown directory errors.

Sensitivity: removing the metadata refusal fails2 targets; rejecting ENOENT fails2; rejecting nonempty/existing-directory races fails4; continuing past ancestor failure fails1. Retaining the completed cleanup promise fails the retry target; stopping metadata iteration fails the independent-file target; stopping parent cleanup on error fails2 targets. These are assertion failures, not timeouts. Both production modules are restored byte-for-byte. Drivers `/tmp/tst006-directory-recovery-check.py` and `/tmp/tst006-cleanup-recovery-check.py` retain exact perturbations.

Validation: scoped lint passes; Electron test types pass with these two test files temporarily overlaid on composeda795057b and restored in `finally`. The composed checkout remains clean. The initial directory-test lint failure was only an extra blank line and was corrected; its log is retained. Evidence `/tmp/tst006-directory-recovery-*`, `/tmp/tst006-cleanup-recovery-{tests,types,lint,restored}.log` and `/tmp/tst006-cleanup-recovery-*-sensitivity.log`.

The earlier table and CSV describe frozena795057b; these15 added targets are a later delta awaiting candidate reconciliation, so the inventory's485 paths and pending-cell counts are unchanged. Root-symlink/concurrent-replacement guarantees, native Windows filesystem behavior, raw-error diagnostic review, writer admission and final integrated coverage remain open. The new checks do not exercise actual operating-system errno generation; the earlier real-filesystem tests remain complementary evidence. Next: reconcile these test-only commits with the final candidate and continue root/account-path plus writer-bound review.

## Recomposition checkpoint

The later test deltas described above are now included in detached65e258ab. All98 selected logging/account-cleanup cases, all types and aggregate code lint pass; [candidate reconciliation](candidate-reconciliation.md#test-only-recomposition--65e258ab) records exact scope. Earlier measurements and provenance retain their original target attribution. The inventory is refreshed to65e258ab; integration/native/final artifact acceptance remains open.
