# Proxy prompt IPC review — September 22

Reviewed production source atb2c7433c: ProxyPromptContract.ts and ProxyPromptIpc.ts. Scope is endpoint policy and its use of the common authorization binder, not full review of the binder/registry or native transport.

## Endpoint contract

Locale, submit and cancel each use a fixed versioned channel, their own capability, proxy-prompt view type and five-request/minute quota per bound channel/web-contents object. Binder authorization and quota consumption precede request validation and effects. Malformed requests therefore consume their channel quota; quotas are not a global pending-work bound.

Credentials require exactly username/password string fields, allowing empty strings and limiting their lengths to1024/4096 JavaScript string code units. No renderer-provided target ID is accepted: handlers use the authorized web contents ID. Cancel requires undefined. Locale requests allow up to32 distinct bounded alphanumeric labels (letter first); responses bound keys and values, and the preload-side helper additionally requires exactly the requested keys. Exhaustive locale shape/Unicode boundary coverage is not established by the current suite.

Renderer helpers invoke fixed channels and reject malformed replies. Their error paths return false/undefined and log the original error alongside a fixed prefix. That is failure containment, not redaction. Boundary action errors are propagated by the common async binder. No real credential disclosure is inferred solely from that raw-error path, and INV-010 confidentiality remains open for those callers. Bind disposal removes all three handlers.

## Evidence and test provenance

All three source/test files originate together in75761fce; no separate preimplementation baseline is established for that original endpoint. The existing eight tests cover fixed invocation, malformed replies, side-effect mapping/disposal, wrong view, malformed/oversized requests and all three channel quotas.

Later test-only335a91a8 changes the sender fixture from legacy file URL to actual `wire-app://shell/html/proxy-prompt.html`, adds seven submission denials (missing capability, foreign session, subframe, other local document, revoked registration, destroyed contents, forged same-ID contents) and an exact maximum-length credential acceptance case. Each denial requires no credential side effects. The endpoint uses the real authorization binder and registry with inert sender/IPC ports.

All16 cases pass. Independently removing capability, contents identity, session identity, main-frame identity, exact-document or destroyed-state checks fails1 corresponding endpoint test each. Changing inclusive credential maximum to exclusive fails1 positive boundary test. All perturbations are restored and16 pass again. This is later characterization of existing policy, not a new runtime fix. Endpoint-level coverage does not replace the common registry/binder suites or native sender tests.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/security/ProxyPromptIpc.test.main.ts
node node_modules/eslint/bin/eslint.js electron/src/security/ProxyPromptIpc.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
```

The type check uses a temporary test-only overlay onb2c7433c; the older report checkout uses composed dependencies, and its full runtime is not being qualified. Overlay is restored. Logs `/tmp/tst006-proxy-ipc-{tests,restored,lint,types}.log` and `/tmp/tst006-proxy-ipc-{capability,contents,session,frame,document,destroyed,limit}-sensitivity.log`. No native process or remote operation occurred.

The frozen491-path inventory remainsb2c7433c; it records the later test delta explicitly until reconciliation. Final native IPC/session/prompt and composed platform gates, diagnostic confidentiality and broader common-boundary review remain mandatory.

## Reconciled candidate

Later6e987dc5 incorporates335a91a8 exactly. All16 endpoint tests are included in74 passing combined Node proxy/window/IPC cases; Electron test types and targeted lint pass. Frozen inventory491 paths now matches6e987dc5. The earlier pending-reconciliation note is historical. Production policy is unchanged and native/confidentiality/locale-shape limits above remain open.
