# Permission policy and session lifecycle review — September 22

Reviewed AccountPermissionPolicy, AccountPermissionSession and their existing fixtures against1a5363f3; production is unchanged in later test-onlyead3eff0. This supplies source/provenance and deterministic lifecycle evidence, not native permission acceptance or full SEC-009 closure.

## Authority and consent

The policy requires the exact registered account owner, capability, current native sender frame/session and approved network origin. Main-frame details are mandatory. Notifications and one or two distinct audio/video scopes are the only accepted requests; unknown/ambiguous scopes deny without prompting. Existing grants still require authority and origin checks. Background ineligibility prevents a new prompt but intentionally does not erase an existing document grant. One consent may be pending per policy; native dialog eligibility is rechecked after the answer, together with exact registry identity, abort signal and document generation. A new registration for the same contents does not inherit the old owner's authority.

Revoke increments generation, clears grants and aborts pending consent. The pending policy slot releases when its consent promise settles, not simply when abort is signalled. The concrete consent adapter must honor cancellation; its native dialog behavior remains separately qualified. AccountViews cancels pending consent on selection transitions and its session adapter revokes on real main-frame navigation, destruction and renderer loss. Hash/subframe navigation intentionally preserves the main document's grant.

## Session lifecycle

A WeakMap tracks one binding per native session. New binding validates a live matching contents/session before disposing the prior binding. Requests/checks reject foreign contents, and native checks require literal true from policy. Policy errors deny and emit a parameterless diagnostic signal. Request completion marks itself complete before invoking native callback, so callback/diagnostic failures cannot repeat a permission answer.

Disposal marks the binding disposed before revocation, immediately denies queued/pending completions, removes its event listeners and installs explicit deny handlers for its session. Stale disposal cannot replace current handlers or revoke a replacement grant. Native null handlers are intentionally avoided because they restore defaults. Late consent completion is ignored. These are the ordinary successful teardown paths: native handler setters, listener registration and policy revocation exceptions are not transactional here. Existing closures contain disposed checks, but this review does not claim complete recovery or resource release after partial native setup/disposal failure. Real AccountPermissionPolicy.revoke clears grants before abort; a synthetic arbitrary throwing revoke is not evidence that a production failure was reproduced.

## Provenance and checks

Policy source/tests were introduced together in565035fe; adapter source/native fixture together inbd9cb81b. Abort behavior and its test changed together in2ddc5ddc; cancellation on account transitions was added in37565aae. These histories do not prove a separate original preimplementation baseline. The existing11 policy tests cover allowed scopes, sender/capability/view/origin/frame denial, background eligibility, cancellation/rejection, concurrent consent, revocation and post-consent authority replacement.

Later test-only29cf098d adds8 adapter lifecycle cases using the actual policy, registry and binder with inert session handlers/EventEmitter contents. They cover explicit deny installation, pending disposal/navigation/crash/destruction denial, ignored late consent, listener release, cancellation before queued policy evaluation, stale binding disposal and throwing native completion. The12 existing native adapter cases additionally exercise real notification permission queries/isolated-world calls, navigation, two real same-session views and destruction; none were executed here.

All19 policy/adapter Node cases pass. Omitting pending denial, once-only completion, queued cancellation or stale-dispose protection fails5/6/1/1 cases. Omitting grant clearing, concurrent-consent exclusion or post-consent authorization fails1 each. The concurrent-consent mutation deliberately leaves its second request pending and fails the existing two-second timeout; other mutations fail assertions. All production mutations restore byte-for-byte and19 pass again. Electron test types and targeted lint pass.

Exact test-only compositionead3eff0, tree1f9163ecfa669dd8055222eeb2d70ba59a112d78, passes129 selected controller/profile/cleanup/reader/IPC/permission Node cases. The source/dependencies are unchanged from1a5363f3, whose production build evidence retains that head.496 original-baseline inventory paths match exactly.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  electron/src/security/{AccountPermissionPolicy,AccountPermissionSessionLifecycle}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/security/AccountPermissionSessionLifecycle.test.main.ts
```

Logs `/tmp/tst006-permission-lifecycle-{tests,restored,types,lint}.log`, `/tmp/tst006-permission-composed-tests.log` and `/tmp/tst006-permission-{pending-denial,once-only,queued-cancel,replacement,grants-revoke,consent-cap,post-consent}-sensitivity.log`. Full native consent adapter/OS/permission-session qualification, partial native setup/disposal failure ownership, broader caller/resource review and final handoff gates remain open. No native process or remote write occurred.

## Production consent adapter tracing

Source and all7 AccountPermissionConsent native fixture cases were inspected at1d7c2a52, not executed. The source/native fixture originate together in50d87d2c, with actual dialog cancellation added in6ba7a58d; no separate original baseline is inferred. Six cases create real windows but stub the dialog; the last restores the actual dialog and cancels it via an AbortSignal. Neither category is Node-only evidence.

Main creates one consent adapter for its owning window and passes it to AccountViews. Policy eligibility there requires the specific view to be visible, plus the adapter's focused/live owner and live account-view checks. The adapter itself does not replace registry authorization: AccountPermissionPolicy owns that check. It permits one pending dialog, requires a canonical origin without path/query/credentials, checks unique known scopes, uses owner-bound localized cancel-default buttons and forwards cancellation from both policy and window closure. Only response1 with a non-aborted signal and renewed eligibility grants consent. Finally removes listeners and releases its pending slot after dialog settlement. A hung dialog is not proven to settle merely because abort was signalled.

Fixture assertions cover origin-only details, audio/video labels, background/aborted/auxiliary/malformed denial, cancellation/unexpected responses/dialog rejection, translated fallback, concurrent prompt denial, late-answer rejection, listener release and real cancellation. Current review does not requalify native focus/modal/abort or OS permission behavior. Native event-listener/handler setup exceptions and broader real-session disposal remain unverified. This is source/fixture disposition only; production is unchanged.
