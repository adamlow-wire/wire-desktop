# Common IPC authorization and registry review — September 22

Source inspected at6e987dc5. This supplements earlier SEC-003 F-003/F-011 review and proxy endpoint evidence; it does not close all registry/native ownership or pending-work obligations.

## Authorization order and lifetime

AuthorizedIpc validates fixed policy declarations, obtains registry authority, checks the permitted view type, consumes the required quota, validates the request, invokes the handler, and validates the response. Sync and async APIs share authorization logic. The handler receives authorized identity/request, not the native IPC event. Response validation occurs after effects and cannot roll them back. Invalid policy rejects; a rate-limited contract cannot be executed without a bound limiter.

Quota state uses a WeakMap keyed by the actual web-contents object. It survives unregister/re-register of that object, isolates different objects and resets at the inclusive window boundary. A malformed authorized request consumes quota; unauthorized requests do not. The limiter is per binding, not a global concurrency limit. WeakMap avoids strong retention of dead contents but does not prove bounded handler queues. The clock is injected for tests and defaults to Date.now; wall-clock adjustments and total pending-operation limits remain separate considerations.

The registry requires valid account binding, a live object, matching session and unused ID. It freezes copied registration metadata/capabilities and captures the registered main frame. Authorization checks object identity, non-destruction, session, registered frame, allowed origin, optional exact URL and capability. Partition/account ID are main-owned registration metadata rather than renderer-selected values. Account-target deletion authorization adds exact account/partition and current main-frame matching. Destroyed/render-process-gone listeners and explicit revoke remove registry entries.

The objects referenced by frozen metadata remain live native objects. The general authorize path compares senderFrame to the registered frame; real navigation/frame replacement, queued messages and lifecycle revocation still need native evidence. Exact allowedUrl remains optional for general views, so review of each local/remote registration is still required. Registry ownership can persist if callers fail to revoke and native lifecycle events are absent. This review does not infer an exploitable race from those limits.

## Tests and sensitivity

Seven common IPC plus16 proxy endpoint tests pass at6e987dc5. Temporary omission of request validation fails3; async response validation fails1; quota consumption fails6; view-type validation fails2; changing inclusive quota reset to exclusive fails2; omitting policy validation fails1. All source is restored byte-for-byte and23 pass again.

Nine existing `secure shell view authority` tests also pass in Node with only an inert Electron protocol import. These use plain sender objects/event-listener ports, not BrowserWindow/WebFrameMain. Omitting destruction revocation fails1; process-loss revocation fails1; account binding validation fails2; duplicate registration rejection fails1. Source is restored and9 pass again. The rest of securityPolicy.test.main.ts, including scheme registration, was not run in this selection and is not qualified by it.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/security/{AuthorizedIpc,ProxyPromptIpc}.test.main.ts
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require /tmp/tst006-node-protocol-port.cjs \
  electron/src/secureShell/securityPolicy.test.main.ts --grep 'secure shell view authority'
```

The temporary adapter asserts there is no Electron runtime, resolves Electron from the checkout and places `{protocol: {}}` in its Node require cache. No protocol method is called by the selected tests. Logs `/tmp/tst006-authorized-ipc-{tests,restored,request-sensitivity,response-sensitivity,quota-sensitivity,view-sensitivity,reset-sensitivity,policy-sensitivity}.log` and `/tmp/tst006-registry-{authority-tests,authority-restored,destroy-event-sensitivity,crash-event-sensitivity,binding-sensitivity,duplicate-sensitivity}.log`. Clean checkout confirmed after perturbations; no production/test changes or native process occurred.

## Provenance and remaining qualification

Core IPC source/tests originate together indd582136. Quota introductiond9e96fd1 has later deny-path/quota coveragec36dda26/e409e9ab; synchronous managed-configuration testc1a71bd8 precedes implementation7725f912. Later baseline3bb1e04e adds quota reuse/sync cases beforeac55c392's WeakMap/pending-save remediation. That multi-module baseline must not be presented as a prior baseline for every original IPC behavior.

View identity baseline8cf6f825 precedes9058fdd5 central authority. Later revocation/exact-URL/child/shell changes e56581da/bdee9ec7/b8ac6fce/9e75c49a include their own scope;9a93c6bb adds later coverage. Native auxiliary baseline18fdc728 and later native fixtures remain separately attributed and unrun here. Account-target authorization originates ind4984b73 and is not qualified by these selected nine tests.

Remaining: native event/frame/session/lifecycle behavior; complete registration/caller audit; synchronous invalid-response/error propagation edge cases; rate-limit/pending-work composition for each effect; native deletion-target authority; diagnostic confidentiality. Existing pending rows and partial dispositions are retained rather than converted into blanket acceptance.
