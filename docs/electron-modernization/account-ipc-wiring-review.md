# Account IPC and production wiring review — September 22

Reviewed contracts, binders, Node fixtures and relevant mainProcess/AccountController call sites at test-only1d7c2a52. Production is unchanged from1a5363f3. This is boundary evidence, not complete controller/UI/native acceptance.

## Production reachability and authority

Main registers the application shell against the exact mainURL.href and assigns account-control capability. It binds AccountControlIpc to the main-owned controller and AccountEventIpc to controller.receive, disposing both handlers on main-window closure. AccountViews receives the account event/permission capabilities; a remote account cannot invoke shell controls even if mistakenly given the shell capability, because the binder also enforces view type. Both routes pass registered identity rather than trusting payload account/session fields. Controller execution rechecks queued authority and environment changes recheck it after consent, as covered by the separate controller review.

Shell commands are read/add, named lifecycle commands with UUIDv4 targets, bounded integer layout dimensions and bounded join data. Joi rejects unknown fields and coercion. Fixed dispatch forwards the captured identity and awaits the operation before reading snapshots. Unknown target IDs are rejected by the main state/controller, not resolved as filesystem paths. The response validator allows1–32 bounded snapshots and excludes sessionID, ssoCode and pending join secrets. Response validation occurs after side effects; its rejection does not roll back a completed command. Pushed snapshot delivery and downstream rendering remain separately reviewed scope.

Account events have fixed discriminants; metadata permits only named display/account metadata. Payloads cannot set desktop-owned identity, session, selection or lifecycle fields. The registry supplies the account target regardless of URL query values. Environment/webappUrl shape validation here is only a string bound; controller policy performs actual network/navigation/managed-destination validation before changing state. Both positive and negative route tests remain necessary. String bounds are not a whole-message byte budget. Per-view quotas are120 controls/minute and600 events/minute; the controller's separate32-pending cap is not replaced by these rate limits.

## Fixture correction and sensitivity

Original control fixture used a synthetic HTTPS origin without the production shell's exact-document constraint. Later9bc86c79 uses wire-app://shell/renderer/index.html with both the URL-derived serialized origin and exact allowedUrl, matching registerApplicationShellIdentity. A hard-coded wire-app://shell origin initially failed fixture registration: Node URL serializes this custom scheme origin as null. The fixture was corrected to derive it exactly as production does. Exact allowedUrl is essential and is now tested against another local document, another host and a changed query. The restored exact document succeeds. This is a synthetic local URL fixture, not actual native scheme startup or full mainURL query construction.

A second new case holds account removal pending and requires no snapshot read/return until removal completes. Omitting its await fails the new assertion; existing failure tests still deny success on operation rejection. All12 control and6 event Node cases pass. Mutations allowing unknown control fields, coercion, skipping removal await, omitting exact document matching, allowing unknown event fields, doubling event quota and permitting account view controls fail3/2/1/1/1/1/2 cases. Production restores byte-for-byte and18 pass. Electron test types and targeted lint pass.

Control source/contract/tests originated together inf29a46d0; event source/contract/tests together in1473439e, which also extended control snapshots. Controller wiring/extended controls follow ine6e71ce4 andbb46ddea; removal-failure snapshots follow in894df496. No separate original baseline is inferred. Existing ELC-003 baseline156b601f precedes Joi migrationabae1a66; its evidence is preserved in the inventory rather than replaced by this later review.

Exact test-only9bc86c79 is composed as1d7c2a52, tree4be8d70e4b8aadba3dd886b84aea5cf4e6053e94.147 selected account/IPC/permission Node cases pass.496 original-baseline paths match; no production/dependency change. Earlier production build remains attributed to1a5363f3.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/security/{AccountControlIpc,AccountEventIpc}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/security/AccountControlIpc.test.main.ts
```

Logs `/tmp/tst006-account-ipc-{tests,restored,types,lint,composed-tests}.log` and `/tmp/tst006-account-ipc-{control-unknown,control-conversion,removal-await,shell-document,event-unknown,event-quota,control-view}-sensitivity.log`. Full renderer consumers, native scheme/frame behavior, snapshot-push disposal/error handling, remaining controller resource/diagnostic scope and final platform/E2E/unsigned-package gates remain open. No native process or remote write occurred.
