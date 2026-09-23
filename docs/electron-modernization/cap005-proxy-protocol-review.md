# CAP-005 proxy protocol application — September 22

F-019: proxy transport/endpoint loss in the production `applyProxySettings` function. Valid SOCKS4/SOCKS5 URLs produce `socks=undefined` because their WHATWG origin is `null`. HTTPS proxy URLs produce scheme-less identifiers, losing the selected secure proxy transport. This is security-relevant proxy configuration failure under CAP-005/DCP-011. Configuration generation is reproduced; actual packet/credential exposure is not asserted.

Chromium's [manual proxy rules](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md#manual-proxy-settings) distinguish target URL mappings from the proxy transport scheme. An identifier without a scheme defaults to HTTP except in the socks mapping, where it defaults to SOCKSv4. Explicit HTTPS/SOCKS schemes preserve the selected transport. Chromium also documents that embedded proxy credentials are not used, and SOCKSv4/v5 authentication is unsupported; this fix does not claim authenticated SOCKS support.

The scoped branch starts at accepted integration897e3930. Its actual proxy application function is the same as composed308fceb4 before this fix. A read-only initial Node proof executes the TypeScript AST-selected production initializer with inert native session/logger ports and records correct HTTP/HTTPS mapping strings but `socks=undefined` for both SOCKS versions. Documentation review identifies the additional HTTPS transport loss; the baseline is strengthened before implementation rather than treating that incorrect output as an accepted control.

Separate baseline **d49d3bf3**:3 controls pass/6 targets fail. The nine cases cover HTTP hostname and IPv6 controls, HTTPS explicit/default443 ports, SOCKS4/5 hostname endpoints, SOCKS5 IPv6, omitted SOCKS port, and pending native application/rejection identity. Every configuration case asserts exact PAC/bypass/rule values, exact NTLM host, one diagnostic, and no synthetic username/password/query in native options or diagnostics. The fixture executes the actual mainProcess initializer, not a duplicate builder. The earlier preliminary3-pass/4-fail result is retained in `proxy-rules-baseline.log`; the final broader baseline is `proxy-protocol-baseline.log`.

The fix uses URL.host for the credential-free host/port, preserves explicit https/socks4/socks5 prefixes, retains existing HTTP rules and the existing target session/NTLM scope, and still awaits native setProxy. All9 cases pass. Removing explicit transport prefixes fails6; copying URL.href instead of host fails8. The pre-fix baseline detects the lost SOCKS endpoint. Omitting native application fails both original HTTP/HTTPS routing controls before the broader HTTPS target is added. All perturbations are restored. This is protocol preservation, not a new proxy mode or changed authentication policy.

Scoped lint passes. Temporarily replacing only this function and adding the new test in composed308fceb4 yields9 passing tests, passing Electron test types and passing production TypeScript compilation. The overlay is restored in finally, the new test removed, and the original composed TypeScript output is rebuilt afterward so generated output does not retain the temporary candidate. The validation checkout is clean. The scoped old-base checkout uses a read-only symlink to the composed dependencies; no full old-base install/qualification is claimed.

Commands:

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/auth/ProxySettingsApplication.test.main.ts
node node_modules/eslint/bin/eslint.js electron/src/auth/ProxySettingsApplication.test.main.ts electron/src/mainProcess.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/typescript/bin/tsc -p tsconfig.build.json
```

The compiler commands refer to the composed overlay described above. Evidence `/tmp/cap005-proxy-protocol-{baseline,restored,final,lint,scheme-sensitivity,credentials-sensitivity,composed-tests,types,build,restored-composition-build}.log`; mutation driver `/tmp/cap005-proxy-protocol-sensitivity.py`. Initial source proof `/tmp/tst006-proxy-application-proof.cjs` uses no real credentials or network.

Next: reconcile the scoped candidate, require actual Electron proxy resolution/transport and supported-platform proxy authentication checks on the final PR head, and retain enterprise live/packaged QA as explicit outstanding qualification. No native Electron, proxy service, remote write, signing/update or user profile was touched. Generic main background diagnostics remain separate review work. The unsigned handoff is incomplete.
