# Account controller queue and authority review — September 22

Scope: the lifecycle queue, event copying and authority checks in AccountController atb2a72752. This is not full controller/native behavior acceptance.

The main lifecycle queue admits at most32 active/queued operations, including native environment approval. Overload rejects before adding to the promise chain. Each admitted operation rechecks native registry authority at execution, including exact registration-object equality: re-registering the same contents must not authorize work carrying its previous registration. Count release runs in finally for success and failure, and a rejected task does not poison the next queue task. Event payloads are copied before admission. Unauthorized queued work does not run the operation or publish a changed snapshot.

Environment changes perform another identity check after native consent, before closing or changing destination. Other methods have their own side-effect sequence and still require complete caller review. Account removal/creation are not database transactions; state persistence and view/data effects have separate recovery paths. General failure reporting remains a separate confidentiality review.

Main-only desktop action dispatch has its own32-operation queue and resolves supported actions through fixed cases; per-account readiness queues hold at most32 copied messages. These are separate limits, not a32-item whole-process memory guarantee. The four focused tests here qualify the lifecycle queue only. Menu dialog lifetime deliberately sits outside it; context-menu and publisher errors, desktop queue concurrency, native lifecycle races and full input-size composition remain separate scope.

## Provenance and checks

F-008 baseline8cd6bd18 precedes28fbf798 pending-lifecycle cap. The existing three Node tests exercise ordered/copied events behind cancelled consent, authority revocation while queued, overload refusal and capacity recovery. They use real controller/state/registry with inert view/session ports and synthetic consent promises.

Later test-only209c9b8b queues a valid event, unregisters and re-registers the same native-contents fixture before releasing the pending approval, and requires the old registration to fail without changing state. A subsequent event with the replacement registration must succeed. All4 cases pass in a temporary test-only overlay onb2a72752. Removing registration-object comparison fails1; removing event copying fails1; removing admission cap fails1; removing count release fails2. All mutations are restored and4 pass again. Electron test types pass with the overlay, which is fully restored. Targeted lint passes after removing one extra blank line; no runtime change.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/accounts/AccountControllerQueue.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountControllerQueue.test.main.ts
```

Logs `/tmp/tst006-controller-queue-{tests,restored,types,lint-fixed}.log` and `/tmp/tst006-controller-queue-{registration,copy,limit,release}-sensitivity.log`. The older audit source predates dependency changes; source-sensitive commands run in the composed overlay. Existing ELC-003 c35af26c availability-wire baseline and original native controller evidence remain separately attributed.

Frozen target/inventory remainsb2a72752/493 paths until later test reconciliation. Do not relabel this as real native consent/navigation testing, closure of the pending Windows lifecycle failures or full AccountController review. Final platform/E2E/package, profile compatibility and remaining audit gates remain required.

## Reconciled authority test

Current00a88ae2 includes209c9b8b exactly. All4 queue tests are included in86 passing combined Node queue/profile/cleanup/IPC checks; Electron test types and lint pass. Frozen inventory493 paths now matches this target. Earlier pending-reconciliation note is historical; production and native/full-controller limits above are unchanged.
