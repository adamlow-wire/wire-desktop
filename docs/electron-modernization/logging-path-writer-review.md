# Log path and writer review — September 22

Scope: composeda795057b production source plus the separately identified test correctionb49d64f9. TST-006 remains incomplete. No production behavior changed and no native application ran.

## Ownership and filesystem boundaries

`logPaths` builds the root from main-owned `app.getPath('userData')`, or the local renderer runtime argument, plus `logs`. Missing root information throws. Daily directories use UTC dates. Account path helpers accept strings without their own UUID check; the production console listener receives the main-owned account through `AccountViews.configure`. Restored accounts pass the strict UUIDv4 profile schema, and new `AccountState` records use `randomUUID`. This is caller-owned validation, not a claim that the path helper safely accepts arbitrary remote account IDs. `getSsoLogPath` has no production caller in the current source search.

Current account removal calls `deleteNativeAccountLogs`: validate UUID, flush previously queued writes, then acquire maintenance. It refuses linked/non-directory roots, canonicalizes the root, selects exact UUID/recognized daily and historic layouts, and checks each target ancestor with lstat/realpath before recursive removal. AccountController closes the producer before cleanup; the flush barrier covers only writes admitted before its snapshot. Nested links are removed without traversing their outside targets. No atomic protection against a competing local process replacing paths between inspection and removal is claimed.

Legacy `accountLogDeletion` uses UUID validation and lexical relative-path containment, exact account matching and a strictly parsed timestamped legacy name. Its production adapter checks the selected directory with lstat; it lacks the current native path's per-ancestor checks. Do not infer equivalent filesystem guarantees or use it to replace the native controller path. Raw path/error diagnostics in legacy cleanup and the desktop background invoker remain a separate confidentiality review scope.

## Admission and ordering

The inspected `boundedLogWriter` source bounds entries to64KiB including the newline, pending entries to256, pending encoded payload to1MiB, and retained path strings to32Ki characters each. It bounds remote console text before regular-expression formatting. Path storage and promise overhead are additional to the1MiB payload bound. Drop reporting retains only a saturated count; a later admitted entry includes a bounded notice. Reservations are acquired synchronously and released in finally, including write/cleanup failure. Per-file promise tails preserve order; failed prior writes do not poison later writes. Flush waits on a snapshot with allSettled while original callers retain their own rejection.

Rotation refuses overwrite through the filesystem adapter and has a128 collision-index ceiling. The planner's maximum file size is not independently an entry-size bound; production's entry limit supplies that protection. `boundLogMessage`'s optional prefix is internal and bounded at its only production call; this review does not advertise it as accepting arbitrary prefixes. Maintenance has its own internal operation queue; the writer bounds admitted write work, not arbitrary callers of maintenance.

## Evidence and provenance

On clean composeda795057b,43 Node cases pass across boundedLogAdmission, boundedLogWriter, AccountLogCleanup and accountLogDeletion. They include controlled blocked writes, real owned filesystem deletion, foreign-account/sentinel preservation, linked roots/ancestors/targets, flush before deletion and failed-write recovery. Command:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/logging/{boundedLogAdmission,boundedLogWriter}.test.main.ts \
  electron/src/accounts/AccountLogCleanup.test.main.ts \
  electron/src/lib/accountLogDeletion.test.main.ts
```

Log `/tmp/tst006-writer-path-review-tests.log`. The settings adapter owns its temporary root; this is not native Electron or Windows acceptance. Previous admission baselineaaa7e250 and correctiona8e0854f, collision baseline4bdaffa0, and queue-drain baselinee4cac57f before fix7d5c34bb remain their original historical evidence. No new coverage percentage or repeat sensitivity is claimed for those existing targets.

Source history: native cleanupb0a7bd8c then7d5c34bb; legacy selectiond0510140/dce4c285 and containment10399b47. Log-path extraction19268e65, layoutd0510140 and renderer-root boundary3b147f3c; facade changes include8872a5b3,9f0ecab7 and7d5c34bb. These are inspected history, not reconstructed test-first claims. Native logPaths tests were read but deliberately not executed with a fake app and represented as native success.

## Corrected facade test portability

The original facade assertion expects literal LF despite production writing `os.EOL`. In a dedicated Node process, `/tmp/tst006-crlf-fixture.cjs` sets only the imported OS newline constant to CRLF before module loading: the original suite yields two passes/one exact-byte failure (`first\r\nsecond\r\n` versus LF). Test-only commitb49d64f9 expects both complete lines using `os.EOL`, preserving exact content/order assertions. All three facade cases now pass under both normal LF and the CRLF fixture. This simulates the newline contract only; it is not Windows emulation or qualification.

Scoped lint and Electron test types with the changed test overlaid on composeda795057b pass; the overlay is restored and the composed checkout is clean. Evidence `/tmp/tst006-writer-{crlf-baseline,crlf-validated,lf-validated,eol-types,eol-lint}.log`. An initial audit-checkout invocation used a missing relative settings adapter; the corrected command uses the composed checkout's absolute adapter path. The initial failure remains in `crlf-restored.log` and is not counted as test evidence.

Next: reconcile later test-only deltas and their documentation with the final composed candidate; review raw diagnostic confidentiality and remaining module coverage. Actual native path/OS behavior, final hosted E2E and shipped artifacts remain mandatory. The inventory remains pinned toa795057b, so its facade row explicitly identifies the later correction instead of pretending the frozen test was already fixed.

## Recomposition checkpoint

The later test deltas described above are now included in detached65e258ab. All98 selected logging/account-cleanup cases, all types and aggregate code lint pass; [candidate reconciliation](candidate-reconciliation.md#test-only-recomposition--65e258ab) records exact scope. Earlier measurements and provenance retain their original target attribution. The inventory is refreshed to65e258ab; integration/native/final artifact acceptance remains open.
