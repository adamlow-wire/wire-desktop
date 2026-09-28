# SEC-013 dispatch diagnostic follow-up — September 22

F-018 is a confirmed diagnostic-boundary defect under existing SEC-013 / INV-010 / DCP-010. The real CoreProtocol handler forwards the original dispatch failure object to the logger, retaining arbitrary message and nested properties. A synthetic failure at its window-manager port proves this behavior without native Electron, network activity or real credentials. This is not evidence of a real credential incident or an exploit in every production dispatcher; severity is medium diagnostic confidentiality, and the gap is repaired rather than waived.

The branch starts from accepted integration897e3930, not the temporary validation merge. CoreProtocol and the real deep-link parser are identical there and in composed65e258ab before this change. The Node fixture transpiles and runs the actual handler with inert Electron/window-manager/logger/dialog ports and the real parser. Four success cases assert exact start-login/SSO/join/location dispatch; malformed input invokes no dispatch and produces only a fixed dialog. Four failure cases inject an Error with a synthetic private message and nested request/auth data and require exactly one useful fixed log message, no error payload and no propagated rejection.

Separate baselinebdbe1595:5 controls pass/4 confidentiality targets fail. Omitting start-login delivery makes its success control fail (3 other controls pass); source is restored. The implementation changes only the catch diagnostic to `Failed to dispatch deep link.` and removes the unused caught error binding. Nine cases pass. Omitting the diagnostic makes all4 failure targets fail, preserving useful diagnostics as a requirement rather than making silence pass. The original baseline itself proves raw-error regression sensitivity. No action, parser, window routing, queue bound or failure-containment semantics change.

Scoped lint passes after correcting initial import order. Nine tests and Electron test types pass when the source/test pair is temporarily overlaid on composed65e258ab; both files are restored afterward and that checkout is clean. This validates the changed boundary with the current dependency graph; it is not whole-old-integration dependency qualification. The new worktree uses a read-only dependency symlink to the composed installation. The Node fixture observes no actual OS launch or native window behavior.

Commands:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/lib/CoreProtocolDiagnostics.test.main.ts
node node_modules/eslint/bin/eslint.js electron/src/lib/CoreProtocol.ts electron/src/lib/CoreProtocolDiagnostics.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
```

The final type command is the composed-overlay run described above, not a claim of a clean install in this old-base branch. Logs `/tmp/sec013-dispatch-{baseline,control-sensitivity,restored,omitted-diagnostic,final-lint,composed-tests,types}.log`; initial import-order failure retained in `baseline-lint.log`. The initial read-only experiment is `/tmp/tst006-core-protocol-diagnostic.{cjs,log}`. These local paths are not durable hosted evidence.

Next: reconcile this scoped fix with the current candidate and complete original native CoreProtocol routing/platform checks on the actual PR head after publication is authorized. Main-process generic reporter and other configure/session errors remain separate TST-006 review scope. No upstream/Wire contact, push, dispatch or native test occurred. The unsigned handoff remains incomplete.
