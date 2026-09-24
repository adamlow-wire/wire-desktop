# Review inventory reconciliation — September 23

## September 24 exact four-fix composed source accounting

The original baseline remains `1b82b085ac1436a7f21d81cb944d2ee2f4ba4a4a`. The reviewed application/source composition is `0fd4679a2cb5d100bdb9d856627903b49bd4bcd8`: PR #63 plus the scoped PR #66/#67/#68/#69 source and tests, with the SEC-003 native test selector. This separate TST-006 audit branch adds the source-review and upstream-delta notes without changing application source. Compared with the previous 543-row audit ledger, five newly changed paths were inserted: the composed checkpoint, both desktop-config source/test files, managed constants, and the native frame-lifecycle test. The two review notes stay in the ledger because this audit branch adds them. `git diff --no-renames --name-status <baseline> <audit branch>` matches **548 unique path/status rows** with no missing, extra, duplicate or status mismatch. Exact placeholder counts are now **292 source-review, 330 test-provenance and 341 coverage-disposition pending** after the five-binder initial source pass; many populated cells are also partial. This is path accounting, not a completed holistic review or proof of full coverage. [Composed native/package run `36058028533`](https://github.com/adamlow-wire/wire-desktop/actions/runs/36058028533) is on exact application SHA `0fd4679a` and is running on Windows/macOS/Linux. The earlier `1f999595` run passed Linux/macOS but its Windows job was cancelled by the workflow's same-branch concurrency when the corrected run started; no Windows installer outcome from that earlier SHA is accepted.

## September 24 exact PR #63 source and review-note accounting

The original baseline remains `1b82b085ac1436a7f21d81cb944d2ee2f4ba4a4a`. The unchanged runnable application candidate is PR #63 `572bbf25b327ebd91aa9dd98fe0eed1d47521a28`; the TST-006 documentation audit branch adds `upstream-delta-2026-09-24.md` and `review-pass-2026-09-24.md` without changing application source. The former 528-row ledger omitted 14 files already changed at its `c49ebae0` target; this pass adds them plus the new review note. A `git diff --no-renames --name-status <baseline> HEAD` reconciliation on this audit branch, with the new review note included as `A`, matches **543 unique path/status rows** with no missing, extra or duplicate entries. Exact placeholder counts are **297 source-review, 330 test-provenance and 341 coverage-disposition pending**, plus many partial notes. This is complete file accounting for this branch's current diff, not a completed code review or a reconciled PR #66/#67 composition. Re-run after any target or documentation-path change.

TST-006's inventory is scoped to the exact original-baseline-to-current-scoped-candidate delta. This is file-accounting and evidence reconciliation, not completed source review or coverage acceptance.

- Original baseline: `1b82b085ac1436a7f21d81cb944d2ee2f4ba4a4a`.
- Local source validation target: `46465040e2d783d29712e4a5cdafc14a4d1a2aa4` (PKG-001 F-021/F-022/F-023 plus scoped ELC-003 Linux disposition).
- Scope: `git diff --no-renames --name-status <baseline> <target>`; additions and deletions are separate rows, including removed source.
- Result: 528 changed paths, 528 unique CSV rows, no missing/extra paths or change-status mismatches.
- Limits: the target is a local composed source candidate, not accepted integration. Later documentation changes on this report branch are not part of that frozen source target. Refresh the inventory against the actual final composed head before acceptance.

## Latest AppImage/runtime-image/desktop and advisory recomposition

Relative to the historical `725efb5c` target below, the current `46465040` baseline delta adds 28 paths: one version-pinned AppRun patch, two ASAR audit utilities and 25 review/evidence documents. No prior inventory path disappears or changes add/modify/delete status. The patched launcher and audit utility rows record partial F-021/ELC-003 review evidence; new documentation rows retain explicit final-review limits. Existing Linux builder, package-verifier, workflow and main-entry rows now identify F-021/F-022/F-023 failing baselines, fixes and static artifacts without treating unrun native behavior as accepted. DCP-005, DCP-020 and INV-001 traceability rows have similarly bounded mappings; all other DCP/INV/IPC rows remain to review. Exact `pending` cells are **296 source / 317 provenance / 328 coverage**, plus many populated but partial rows. These are counts of exact placeholder text, not completion percentages. The all-format hosted workflow, final Windows/macOS artifacts, profile contract and final composed platform evidence are still open. Separately, confirmed F-017 log-export preservation source `39bdfe5c` is an ancestor of this target and its 17 Node filesystem/ZIP cases pass again on current scoped source; native chooser/ACL behavior is still unqualified.

## Historical package-input and account-preload recomposition

The source target `725efb5c` adds exact `dda2cc6b`/`7280d5d9` package-filter characterization/fix and `f655d236`/`3bfa7434` account-preload diagnostic characterization/fix on top of `2ba7ade3`. The only new path relative to the prior499-row target is `electron/src/preload/preload-account.test.main.ts`; package policy and preload source paths already existed. The ledger now has500 exact rows. Scoped source/provenance/coverage notes are partial, not a whole-module review. The package test detects the original top-level tar inclusion and a temporary overbroad exclusion of nested semver; the preload test detects raw rejected-Error logging. Both perturbations were restored. Combined focused182 cases, relevant types/lint, production build, local unsigned Linux directory and actual AppImage/deb/rpm static artifact verification pass. [Artifact evidence](shipped-linux-asar-audit.md#actual-unsigned-linux-installers-from-the-composed-candidate). Source review has297 exact pending cells, provenance319, and coverage329; partial cells and behavior traceability still require review.

## Capture cleanup recovery recomposition

Latest2ba7ade3 adds test-onlyd5a47d03 failed-removal retry confidentiality; runtime/build attribution remains5f2852cd.499 paths match. Earlier5f2852cd includes baseline74590da5 and scopedeb82163b fixed renderer diagnostics;86 renderer cases, root types, lint and production build pass.499 paths match. Earlier1555802d adds exactc9a542c1 test-only synchronous setup coverage;53 capture cases, Electron test types and lint pass, runtime unchanged.499 paths match. Earlier1c301664 adds exactd1df4fca/ce028312 constructor baseline/fix;47 capture cases, Electron test types, targeted lint and production build pass.499 inventory paths match. Earlier0a961791 adds exact57c46a3b/8e8b5682 startup fixture and5ca6dbf6 fix;40 inert cases pass.498 inventory paths match; full composed/native qualification remains open. Earlier7fbd3b7d adds exact14a1578e permission characterization with production unchanged;35 inert cases pass. Targeted lint/standalone test types pass, not full composed qualification. Earlier4b1eb667 adds8986305a/26706fb8 port tests/fix;22 inert cases, types/lint/build passed September22. Temporary logs subsequently disappeared; see status for recovery. Earlier40f9b191 copies exact8727695e coordinator/new cleanup fixture onto7a3b6e72.497 paths match the original-baseline delta.17 capture cleanup/contract Node cases, Electron/production types, lint and production TypeScript/webpack build pass. [Capture cleanup recovery](cap003-capture-cleanup-recovery.md) records sensitive baselines and limits; native/OS stream termination and full capture review remain open.

## Renderer consumer reachability review

Source-only review at7a3b6e72 distinguishes current named main-owned controls from retained legacy helpers.11 index/sidebar/slot Jest cases pass; four routing/visibility mutations fail1/3/2/1 then restore. [Routing review](renderer-account-routing-review.md) preserves diagnostic/native/legacy limitations. Target/path count unchanged;496 exact paths.

## Renderer bootstrap recovery recomposition

Latest7a3b6e72 composes exact59ae067b renderer source/test delta.496 paths still match.82 renderer/4 bridge Node cases, root/Electron test types and corrected lint pass. [Snapshot/bootstrap review](account-display-review.md) records reproduced race, sensitive fix and native/consumer limits. Earlier147 Node cases retain1d7c2a52 attribution.

## Account IPC wiring test recomposition

Test-only1d7c2a52 contains exact9bc86c79 shell fixture and awaited-removal coverage.496 inventory rows match exactly.147 selected Node cases, Electron test types and lint pass. [IPC wiring review](account-ipc-wiring-review.md) and [native consent tracing](permission-session-review.md) retain native/renderer/partial failure limits; this is not blanket acceptance.

## Permission lifecycle test recomposition

Test-onlyead3eff0 adds exact29cf098d adapter lifecycle characterization.496 paths match exactly.129 selected Node cases, Electron test types and targeted lint pass. [Permission review](permission-session-review.md) records policy/adapter provenance and mutation evidence without accepting native session/OS behavior or partial native setup/disposal failure paths.

## View teardown recovery recomposition

Latest1a5363f3 composes exact8d8fe8cd source/test delta on5ad76db6. No new paths:495 inventory rows still match exactly.110 selected Node cases, Electron/production types and targeted lint pass. [Teardown evidence](cap001-view-teardown-recovery.md) records failed-owner retry/reservation and handled event callbacks, with native/permission-session and final gate limits.

## View setup cleanup recomposition

Latest5ad76db6 includes exact554fc245 view source/test delta on5112c50a.495 inventory rows match exactly.101 Node cases, Electron/production types and targeted lint pass. [Setup cleanup evidence](cap001-view-setup-cleanup.md) records baselines, sensitivity and native/teardown limits. Full view review and final qualification remain open.

## Controller removal test recomposition

Latest5112c50a adds exact374125ab removal characterization; production is unchanged.494 rows match the original-baseline delta exactly.90 selected Node cases, restored Electron test types and targeted lint pass. Partial removal review and native fixture dispositions are in [controller removal review](account-controller-removal-review.md); native view failure ownership and full controller review remain open.

## Queued authority test recomposition

Latest00a88ae2 copies exact209c9b8b AccountControllerQueue.test.main.ts onto b2a72752. Production and path count unchanged;493 rows match exactly.86 selected Node queue/profile/cleanup/IPC cases, Electron test types and targeted lint pass. Pending319/345/355 plus partial reviews remain; actual native authority/lifecycle and full controller qualification remain open.

## Legacy reader cleanup recomposition

Latestb2a72752 copies exact0c7152bf reader source and inert lifecycle tests onto68ce2478. One new path gives493 exact rows.59 selected profile/state/cleanup/reader Node cases, Electron/production types and lint pass. Actual native reader tests remain unrun; profile/ciphertext compatibility unchanged. Pending319/346/356 cells and partial reviews remain.

## Profile recovery test recomposition

Latest68ce2478 copies exactf5ae6ede AccountProfile.test.main.ts onto5eef88e6. No production changes or new paths;492 inventory rows match exactly.48 selected profile/state/cleanup/retired IPC Node cases, Electron test types and targeted lint pass. Pending321/348/358 cells and partial dispositions remain; native profile/ciphertext compatibility and final gates are not qualified by these checks.

## Account cleanup order recomposition

Latest5eef88e6 copies exact98353af7 AccountSessionCleanupOrder.test.main.ts onto6e987dc5. One new path gives492 exact inventory rows.108 selected logging/cleanup/retired IPC Node cases, Electron test types and targeted lint pass. Production is unchanged; native session clearing and Windows lifecycle remain open. Pending323/351/361 cells and other partial reviews remain.

## Proxy IPC test recomposition

Latest6e987dc5 copies the exact endpoint test from335a91a8 onto b2c7433c; production is unchanged. All74 selected Node proxy/window/IPC cases, Electron test types and targeted lint pass. Inventory remains491 exact paths, pending329/358/368 and partial reviews. Earlier production build evidence belongs tob2c7433c; no native qualification is claimed.

## Window load cleanup recomposition

Latestb2c7433c copies the window source and lifecycle test from CAP-0057787cc7c onto4441ef7a. One new test path gives491 exact inventory rows.58 selected Node proxy/window cases pass. The window row records lifecycle scope and prior identity provenance without blanket acceptance; pending332/361/371 cells and other partial reviews remain.

## Terminal-close recomposition

Latest4441ef7a composes CAP-005cf9e228e plus cleanup tests4a75a8bc: three existing paths change, leaving490 exact original-baseline rows.55 Node proxy cases, Electron/production types and targeted lint pass. The reproduced closed-prompt restoration is corrected locally; native close/IPC/session, simultaneous challenges and final head acceptance remain open. Pending333/362/372 cells remain plus partial populated rows.

## Startup proxy recomposition

Latest06b58f50 adds CAP-005d5e32f55 startup validation and baseline6c41d6f9 regression. Caller tracing exposed valid SOCKS rejected before the earlier builder and invalid file configuration appended before rejection; acceptance is now tested at startup too.47 selected Node proxy cases pass. One added path gives490 exact inventory rows. Native startup/transport remains unqualified; mainProcess review remains partial.

## Native resolver test recomposition

Latest2ea74556 incorporates test-only d204e2d5: shared production AST loader and seven native resolver cases. Two added paths bring the exact inventory to489; existing application-test provenance is preserved. All31 selected Node proxy cases, Electron test types and targeted lint pass. Native tests and their mutation sensitivity remain unrun. Populated native rows explicitly record missing evidence rather than acceptance; pending-cell counts below are unchanged.

## Proxy application recomposition

Latest73f76118 includes only CAP-005 candidate1381a854's proxy initializer change and its regression file atop308fceb4. The rest of the composed mainProcess is preserved. One added test makes487 original-baseline paths; exact accounting passes. All31 selected Node proxy application/authentication/prompt cases pass together. The mainProcess row remains partial, with F-007 and F-019 evidence attributed separately. Native resolution/transport and final platform acceptance remain open.

## Dispatch diagnostic recomposition

Latest308fceb4 includes scoped SEC-013 source/testa2d77b19 and later navigation testsdfb19f0a. One added regression file makes the original-baseline delta486 unique paths. The other two changes affect existing paths. Exact accounting passes; annotations preserve partial CoreProtocol review and native limits. All29 dispatch/navigation Node cases pass on this target. Earlier test-only recomposition below remains historical.

## Test-only recomposition

The latest target65e258ab applies only the reviewed secure-shell phase diagnostic173b6289, cleanup characterization7b7f09e5 and newline correctionb49d64f9 to a795057b. Four existing test paths change; the485-path original-baseline inventory remains exact. Updated annotations identify the two later characterization files and the corrected facade assertion; older unchanged-module evidence remains attributable to its original target. All98 selected logging/account-cleanup Node cases pass together. No production/dependency/workflow change or native qualification follows from this recomposition. See [candidate reconciliation](candidate-reconciliation.md).

## Corrected omissions

The first correction at `3e93ea42` covered484 paths to `09214ca9`. The latest refresh includes CAP-004 `39bdfe5c` through detached `a795057b`: one new log-export recovery test path plus updated review/provenance for the affected logging modules. Their Git blobs match the scoped candidate. All68 Node logging tests and final composed types/lint/build pass; this does not replace native filesystem/chooser qualification.

The starting report branch had465 rows for464 unique paths. It omitted20 paths and duplicated `bin/deploy-tools/s3-cli.ts`; the substantive CLI entry replaces the pending duplicate. `electron/src/logging/logStartup.ts` used `R054` while the inventory otherwise tracked paths; its change is now `A` under the explicit no-renames convention.

Missing entries included production `bin/bin-utils.ts`, deleted `electron/src/lib/zip.ts`, updater/config/availability modules, backup/recovery/wrapper/package-input tests and adapters, dependency tests, and packaging-verification documentation. Every omitted path is now present. Paths without evidence stay pending.

Sibling ledger inputs were `a1cb2b84`, `b58de5a1`, `8dc1b19a` and `3f2c1bef`. Sixty-six annotations were carried over only after the target path's Git blob matched the source candidate's blob. This proves applicability of that file version, not completeness of its review. Baseline/sensitivity/test counts remain historical unless separately identified as composed validation. The workflow blob differs in composition, so its source review remains explicitly pending; the separate parsed-step check does not qualify actual CI execution.

The previously omitted backup/wrapper entries now identify their existing baseline commits and observable assertions:

| Paths | Provenance / retained limit |
| --- | --- |
| `bin/bin-utils.ts`, `bin/bin-utils.test.ts` | `5efc93d8` two controls pass/three failures; `c70432e5` fixes recovery; actual filesystem tests and indexed-name sensitivity. Other command-helper behavior is still pending. |
| `bin/build-tools/build-wrapper.test.ts`, `bin/build-tools/fixtures/build-wrapper.cjs` | `1df0ce00` 21 controls pass/one MSI read failure; `e5022d63` correction. Inert native ports exercise real wrappers/filesystem recovery; actual packages remain unqualified. |
| `bin/build-tools/lib/build-recovery.test.ts` | `03e1666e` seven write-failure targets precede `12ecd796`; tests assert original bytes after partial writes. |
| `bin/build-tools/lib/package-inputs.test.ts` | `9de6fb4a` 16 controls pass/98 failures; later directory cases remain later regressions, not relabelled original tests. |
| `electron/src/lib/zip.ts` | Deletion at `035aae92`; no `zipFiles` or `lib/zip` consumers remain in the composed application/tooling tree. Streaming log-export successors require their own review; deletion is not their coverage evidence. |

Historical test objects were checked with `git cat-file -e <baseline>:<path>`, and current source/assertions were inspected. Their unchanged composed versions are included in the preceding376-pass tooling run; no new test run or mutation was needed for this documentation repair. Original sensitivity outcomes remain attributed to their recorded baseline/implementation work.

## Restored dependency qualification

[September23 exact candidate qualification](recovered-candidate-qualification.md) records immutable installation on pinned Node, four typecheck groups,82 renderer/376 tooling/40 inert capture passes, targeted lint and production build. Native/final package gates remain open; review dispositions are not automatically promoted.

## Remaining review work

Exact `pending` cells after the latest refresh:298 source-review,320 test-provenance and330 coverage-disposition cells. Controller/queue rows now have [partial queue authority review](account-controller-queue-review.md), without accepting the full controller. Reader source/native fixture and added inert regression now have explicit limits and provenance. Four profile/state rows now carry [persistence and ownership review](account-profile-review.md), preserving native compatibility/ciphertext limits. Five deletion IPC/cleanup rows now distinguish [retired route and active cleanup evidence](account-deletion-review.md); native and controller composition limits remain open. Four common IPC/registry rows gain [scope-specific review and sensitivity evidence](common-ipc-review.md), retaining native and per-handler limits. Three proxy IPC rows now have [endpoint review and later sensitive-test dispositions](proxy-ipc-review.md); test delta335a91a8 is now reconciled in6e987dc5. Proxy window source/new test now have partial lifecycle dispositions; native and earlier setup failure gates remain open. Eight proxy authentication/prompt rows now have [partial dispositions and a reproduced terminal-close gap](proxy-authentication-review.md); populated entries are not acceptance. The two account-startup entries now identify their existing diagnostic boundary and later test delta. Six lifecycle/invoker rows now have [diagnostic ownership and test-sensitivity dispositions](logging-diagnostic-review.md). Eight additional path/facade/account-cleanup rows have [explicit ownership and validation limits](logging-path-writer-review.md). Twelve logging source/test rows now have [explicit review and gap dispositions](logging-boundary-review.md), with17 restored passes and six assertion-sensitive perturbations; they are not blanket acceptance. Populated cells can still describe partial review, unrun native gates or inherited evidence; these counts are not completion percentages. Behavioral traceability remains a separate unfinished ledger.

Do not mark entries complete based only on passing tests, a matching blob or a nonempty note. Continue source and test review in security/data-loss/resource-bound order, map untested behavior and retain missing original provenance explicitly. The current command helper and streaming log-export successors are examples of work still requiring their own disposition.

Recheck accounting whenever the target changes. The following read-only check must run in a checkout containing the named target object and the reconciled inventory; unpublished local composition objects are not assumed available in a fresh clone:

```python
import csv
import subprocess

baseline = '1b82b085ac1436a7f21d81cb944d2ee2f4ba4a4a'
target = '46465040e2d783d29712e4a5cdafc14a4d1a2aa4'
with open('docs/electron-modernization/review-inventory.csv', newline='') as source:
    rows = list(csv.DictReader(source))
actual = {row['path']: row['change'] for row in rows}
assert len(actual) == len(rows), 'Duplicate inventory paths'
changed = subprocess.check_output(
    ['git', 'diff', '--no-renames', '--name-status', baseline, target], text=True
)
expected = {}
for line in changed.splitlines():
    change, path = line.split('\t', 1)
    expected[path] = change
assert actual == expected, 'Inventory paths or change statuses differ from target'
```

This guard checks accounting only. It intentionally does not turn pending review/provenance/coverage fields into accepted results.
