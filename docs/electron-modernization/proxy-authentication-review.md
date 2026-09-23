# Proxy authentication and prompt lifecycle review — September 22

Reviewed source: detached06b58f50. This is a partial CAP-005/TST-006 source/provenance/coverage disposition, not native authentication qualification.

## Boundaries and evidence

- `ProxyLogin` reads OS settings and uses credentials only when native challenge host (case-insensitive) and port match. Missing credentials/settings or reader rejection lead to the prompt. Application is awaited before saving state/authentication; application failure calls the native authentication callback without credentials and rethrows. The event binder ignores ordinary server authentication and captures the challenged contents/session. Settings objects are trusted library outputs; malformed object fields, proxy URL construction failures and downstream callback throws have no separate recovery coverage.
- `ProxyPromptActions` builds a URL from native challenge host/port and current selected protocol, awaits session setup, then saves state and authenticates. Cancellation awaits `setProxy({})` and reloads only the challenged view. This preserves the existing empty-config behavior; it does not prove native auto-detection policy or explicit cancellation of every outstanding challenge. Reload errors are shown and logged with original details. No confidentiality guarantee follows from the fixed prefix.
- `ProxyPromptCoordinator` rejects invalid/duplicate IDs, consumes one action at a time and restores a failed action for retry. Successful submission/cancellation cannot be replayed through the active map. The map has no explicit lifecycle disposal or maximum size; passing tests alone do not establish bounded lifetime.
- `ProxyPromptRegistration` registers when the native window is created, and its close callback cancels only if `has(id)` reports active. It does not wait for an in-flight action or handle window-load failure itself. Native window code calls the callback on `closed`; preload normally closes after successful IPC, but the native window can close while the IPC operation is pending.

The four modules'22 existing Node cases pass. Temporary removal of challenge host matching fails1; port matching fails1; awaiting session application fails2; consume-once deletion fails5; native-close cancellation fails2. Source is restored byte-for-byte and22 pass again. Logs `/tmp/tst006-proxy-auth-{host,port,await,consume,close}-sensitivity.log` and `/tmp/tst006-proxy-auth-restored.log`. Command:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js \
  --require ./electron/test/node-settings-context.cjs \
  electron/src/auth/{ProxyLogin,ProxyPromptActions,ProxyPromptCoordinator,ProxyPromptRegistration}.test.main.ts
```

Provenance: coordinator/actions/registration source and original tests originate together in75761fce, with void-callback correction4b8c5da8 and challenged-account routing79255557. Automatic-login source/tests originate together in42b0ff6a; event-binding coverage follows in2fd2f5d1. The later state-publication tests have a separate baselinea5bcb6a5 before implementationcb495e9d. This review does not relabel same-commit tests as preimplementation baselines. Native IPC authority/payload contracts and proxy window/preload remain separate review scope.

## Reproduced close-during-submission gap

A Node execution of the actual coordinator and registration modules at06b58f50 reproduces this sequence, using an inert native window port:

1. Register101 with `submit` returning a controlled pending promise and a counted `cancel` action.
2. Call `coordinator.submit(101, syntheticCredentials)` and attach a rejection handler. `has(101)` is false while the promise is pending.
3. Invoke the registered native-close callback; it does not cancel because the entry is currently consumed.
4. Reject the pending submission and await the handled rejection.
5. `coordinator.has(101)` is now true, while cancellation count is zero: retry state was restored for a closed prompt.

This is a deterministic retained-registration/lifecycle failure, not a proven credential disclosure or native memory-exhaustion exploit. Existing22 tests miss it because they cover close before action or after successful completion, and failed retry while still open. A failed cancellation after native close can likewise restore state with no live prompt, but that additional sequence has not yet been executed here.

Next executable CAP-005 work: add a separate failing regression for close while submission is pending, then give registration/coordinator explicit terminal-close ownership. Preserve one-shot credentials and retry while a prompt is live; ensure closed prompts cannot regain retry authority after rejection. Test successful/rejected pending submission and cancellation, ordinary open-prompt retry and callback failure, with sensitive mutations. Qualify actual native close/session behavior later on authorized CI. No runtime change or native process occurred in this review.

## Scoped terminal-close candidate

CAP-005cf9e228e addresses the reproduced restoration gap after separate baseline466c384a (7 controls pass/2 fail). Registration marks native close terminal; coordinator restoration consults that lifecycle. Close observes a consumed submission, cancelling after rejection but not success. Live-prompt retry is retained.12 focused coordinator/registration cases pass; removing terminal retry gating fails3, removing cleanup fails1, denying live retry fails1.28 Node proxy cases, Electron/production types and lint pass with the three changed files temporarily overlaid on06b58f50; overlay is restored. Logs `/tmp/cap005-close-composed-{tests,types,production-types,lint}.log`.

The frozen490-path inventory still describes06b58f50, so the defect remains present in that target until reconciliation. Do not infer native closure/IPC/session success or general diagnostic confidentiality from the candidate. Terminal cleanup-failure reporting and simultaneous native challenges remain review scope.

## Reconciled validation at4441ef7a

The frozen target now includes cf9e228e and later test-only4a75a8bc. The preceding defect description and06b58f50 references are historical.55 Node proxy cases, Electron/production types and targeted lint pass. Two added tests verify distinct submission/cleanup error delivery with close-before-reject and reject-before-close, one cleanup despite repeated close and no retry restoration; swallowing cleanup error fails2 and restoration passes14 focused cases. This establishes observer delivery, not diagnostic redaction. Actual native lifecycle, simultaneous challenges and remaining module limits above remain unqualified.

## Proxy window load ownership follow-up

Actual ProxyPromptWindow source uses a local variable per call, so there is no singleton challenge substitution in that function. Its load-failure path at4441ef7a does retain the hidden window/registration, and close during loading clears the variable before the final show call. CAP-005 baseline69c00708 executes the actual function with inert native ports:1 control passes/2 lifecycle targets fail. Scoped7787cc7c destroys still-live owned windows on load/send/show failure and rejects with fixed open diagnostics; it refuses to show/notify a closed window.3 cases pass; destruction/show omission each fails1, then restored3 pass. A two-file overlay on4441ef7a passes33 window/proxy Node cases, Electron/production types and lint; overlay restored.

The target/inventory remain4441ef7a/490 paths until this later source/new-test delta is reconciled. Native window/identity cleanup, failures during earlier setup, destruction failure and simultaneous challenge behavior remain separate qualification. Evidence `/tmp/cap005-window-composed-{tests,types,production-types,lint}.log`; no native process or credential data used.

## Window candidate reconciled atb2c7433c

The current frozen target includes7787cc7c and its new lifecycle baseline test.58 Node proxy/window cases, all four type checks, aggregate lint and production TypeScript/webpack build pass. Inventory491 exact paths; pending332/361/371 and partial rows remain. Earlier4441ef7a load-error observations describe the pre-fix source. Native auxiliary failure/close/identity/session qualification and earlier setup/destruction-failure review remain open; this is not a full proxy subsystem acceptance.
