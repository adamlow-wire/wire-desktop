---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-09-02
milestone: M3
active_work_item: SEC-003
state: m3-safe-storage-contract-validation
integration_branch: integration/electron-modernization
integration_base_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
integration_head_commit: 63f7fa9beb2b5db95b7daf846dae2327b223224f
scaffold_commit: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: 6f9b6a994500f0fc0ad64e60882ac9f5b099d5f2
related_pending_branch: sec/SEC-003-safe-storage-contract-2026-09-02
next_work_item: SEC-003-managed-config-slice
blockers: []
---

# Current project status

## Current outcome

M0, M1, and M2 are complete. M3 is active. [PR #8](https://github.com/adamlow-wire/wire-desktop/pull/8) merged on 2026-08-21 after all required build, lint, CodeQL, package, and authenticated E2E checks passed. It extends the opt-in secure shell from one account to an exact-target, main-owned account collection. The legacy product path remains available while CAP-001 migrates one bounded lifecycle slice at a time.

[PR #9](https://github.com/adamlow-wire/wire-desktop/pull/9) merged upstream commit `e548edeb65a31a75b01933a81c1c34926639b0b0`, including native Windows MSI support, into the integration branch after all required checks passed. Electron remains pinned at `43.4.0`; adoption of Electron 44 is intentionally deferred and is not an M3 gate.

[PR #10](https://github.com/adamlow-wire/wire-desktop/pull/10) merged on 2026-09-02 after every required build, lint, CodeQL, package, and authenticated Windows/macOS E2E check passed. CAP-001 now removes view authority before clearing only the targeted secure account session; production account action routing remains open.

[PR #11](https://github.com/adamlow-wire/wire-desktop/pull/11) merged on 2026-09-02 after every required check passed. It synchronizes upstream `dev` through `6f9b6a99`, preserves Electron `43.4.0`, and makes the authenticated E2E fixtures resilient to Electron account-view replacement and measured staging latency without weakening behavioral assertions.

[PR #12](https://github.com/adamlow-wire/wire-desktop/pull/12) merged on 2026-09-02 after every required check passed. TST-003 now locks down tray click, tooltip, icon-selection, unread, badge, and macOS/non-macOS flashing branches; CAP-004 retains visible packaged tray behavior.

[PR #13](https://github.com/adamlow-wire/wire-desktop/pull/13) merged as `0281c134` after clean changed-code coverage, lint, CodeQL, all three package baselines, authenticated Windows/macOS E2E, and merged reports passed. SEC-002 now gives every current application, account, SSO, auxiliary, picture-in-picture, and developer-tool view an immutable main-owned identity; SEC-003 owns applying that authority to every privileged IPC channel.

[PR #14](https://github.com/adamlow-wire/wire-desktop/pull/14) merged as `63f7fa9b` after clean changed-code coverage, lint, CodeQL, all three package baselines, authenticated Windows/macOS E2E, and the merged report passed. SEC-003 now has a fail-closed typed contract primitive and the secure-shell runtime-info proof channel uses it; product-wide privileged-channel migration remains open.

## Active work

| Field         | Value                                                  |
| ------------- | ------------------------------------------------------ |
| Work item     | SEC-003 — Typed, validated, capability-specific IPC    |
| Owner         | `adamlow-wire`                                         |
| Active branch | `sec/SEC-003-safe-storage-contract-2026-09-02`         |
| Goal          | Authorize and bound the legacy safe-storage IPC bridge |
| Starting gate | PR #14 merged green at `63f7fa9b`                      |

## Next executable sequence

1. Validate and merge SEC-003's safe-storage contract slice.
2. Migrate managed configuration through an authorized immutable contract, then continue the remaining privileged IPC inventory.
3. Complete production account action routing and account-targeted event migration in subsequent CAP-001 PRs.
4. Complete the remaining product-wide M3 security boundaries and critical capabilities in dependency order, one primary work item per PR.
5. Keep Electron at `43.4.0` during M3; revisit Electron 44 and Windows ia32 scope before the next runtime upgrade or release-candidate cut.

## Completed work

| Work item                                               | Evidence                                                |
| ------------------------------------------------------- | ------------------------------------------------------- |
| GOV-001 — Establish fork and integration workflow       | GitHub API readback on 2026-08-18                       |
| GOV-003 — Establish durable human and AI project memory | Commit `567be7646a61fdd725f7fdb693880a294d65d155`       |
| ELC-001 — Inventory Electron compatibility blockers     | `electron-compatibility.md`                             |
| TST-001 — Make coverage reporting accurate              | Commits `c27cfa6a`, `d96baaad`                          |
| BASE-001 — Capture a reproducible legacy baseline       | PR #3 run `32364188026`                                 |
| BASE-002 — Create the capability acceptance matrix      | PR #1                                                   |
| ARC-001 — Approve target process and view architecture  | ADR 0001; PR #1                                         |
| SEC-001 — Threat model the desktop wrapper              | `threat-model.md`; PR #1                                |
| TST-002 — Characterize enterprise SSO                   | 18 passing / 3 CAP-002 security targets pending         |
| ELC-002 — Upgrade Electron to latest stable             | PR #6; Electron 43.4.0; final package/E2E green         |
| ARC-002 — Implement secure single-account shell proof   | PR #7; 17 security-target tests; all-platform CI        |
| TST-004 — Add security-boundary regression tests        | PR #7; sensitivity proof; mandatory all-platform        |
| TST-003 — Characterize tray/native integration          | PR #12; sensitivity proof; all-platform CI              |
| SEC-002 — Central view identity/capability registry     | PR #13; 100% changed security branches; all-platform CI |

## Last verified state

| Check | Result | Date |
| --- | --- | --- |
| Plan formatting | `prettier --check` passed | 2026-08-20 |
| Work item identifiers | Unique | 2026-08-18 |
| Work item dependencies | All identifiers resolve; graph is acyclic | 2026-08-18 |
| Integration publication | Branch pushed to `adamlow-wire` fork | 2026-08-18 |
| Integration protection | PR required with zero external approvals; strict required checks, no admin bypass/force push/deletion, conversation resolution; API read back | 2026-08-18 |
| Application and test types | Passed | 2026-08-20 |
| Legacy development build | Passed | 2026-08-20 |
| Jest baseline | 14 suites / 36 tests passed | 2026-08-20 |
| Electron main baseline | 54 passed / 3 CAP-002 targets pending; first run hit the known tray focus flake and the unchanged rerun passed | 2026-08-20 |
| Electron renderer baseline | 2 tests passed | 2026-08-20 |
| Build-tool baseline | 13 tests passed | 2026-08-20 |
| SSO characterization | 18 passed / 3 CAP-002 security targets pending; new error tests sensitivity-proven | 2026-08-20 |
| Coverage pipeline | 46 main/preload + 32 local-renderer files; pass | 2026-08-18 |
| Linux AppImage baseline | PR #6 first run confirmed builder 25.1.8 could not resolve Electron 43 ABI and incorrectly exited 0; repair and fatal artifact gate pending rerun | 2026-08-20 |
| Windows/macOS packages | Development package and launch smoke passed in PR #1 CI | 2026-08-18 |
| Development E2E | Run `32364188026`: Windows/macOS jobs passed; merged report 57 expected, 3 unrelated flaky, 0 unexpected; all group-call/logout cases passed first attempt | 2026-08-20 |
| Electron 43 local compatibility | Runtime `v43.4.0`; types/build passed; Jest 14/36, main 54 + 3 pending, renderer 2, build tools 13 all passed | 2026-08-20 |
| Electron 43 final package baseline | Run `32463021013`: Windows, macOS, and Linux passed with required artifacts | 2026-08-21 |
| Electron 43 final E2E | Run `32463021040`: Windows/macOS passed; merged report 57 expected, 3 unrelated retry passes, 0 unexpected | 2026-08-21 |
| M2 changed-code coverage | Run `32469363415`: 80.00% changed statements and 95.45% changed security branches; pass | 2026-08-21 |
| M2 secure-shell/package baseline | Run `32469363410`: 17 security-target tests plus package/artifact smoke passed on Windows, macOS, and Linux | 2026-08-21 |
| M2 legacy E2E | Run `32469363449`: Windows/macOS and merged report passed; 55 first-attempt passes, 5 disclosed retry passes, 0 unexpected | 2026-08-21 |
| Capability matrix review | ARC-002 proves architecture/security boundaries but does not migrate product capabilities; confidence rows remain unchanged for CAP-001 | 2026-08-21 |
| CAP-001 account selection characterization | Legacy reducer 8/8 passed; changing exact selection from equality to inequality failed the new lifecycle test, then the reverted test passed | 2026-08-21 |
| CAP-001 secure account selection | Local Electron main suite 73 passed / 3 owned CAP-002 targets pending; secure-shell subset 19/19; target mutation failed both visibility/isolation tests; types and lint passed | 2026-08-21 |
| CAP-001 hosted account selection | PR #8 final head: build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and merged report all passed | 2026-08-21 |
| Upstream synchronization preflight | Upstream PR #9722 is 15 commits ahead; three-way merge completed without conflicts on the dedicated synchronization branch | 2026-08-26 |
| MSI/Electron-builder compatibility | The imported MSI configuration suite initially failed because Electron Builder 26 loaded an ESM-only transitive module under Jest; deferring the runtime import until packaging preserved behavior and the suite passed 10/10, followed by Jest 19/19 suites and 62/62 tests | 2026-08-26 |
| Upstream MSI changed-code coverage | PR #9 first hosted run correctly rejected 58.97% changed-statement coverage; focused registry, managed-endpoint, MSI/Squirrel, and missing-updater tests raised the same local gate to 38/39 statements (97.44%). Replacing the MSI-only logical AND guard with logical OR failed the new lifecycle test and the mutation was reverted | 2026-08-26 |
| Upstream synchronization hosted validation | [PR #9](https://github.com/adamlow-wire/wire-desktop/pull/9) merged as `a86ad130`: build/test, lint, CodeQL, Windows/macOS/Linux packages, authenticated Windows/macOS E2E, and the merged report passed in [run 32973656020](https://github.com/adamlow-wire/wire-desktop/actions/runs/32973656020) | 2026-08-26 |
| CAP-001 targeted deletion | The real-Electron test initially retained account A local storage under a remove-only perturbation, then passed after exact-session storage/cache clearing; account B local storage and cookies remained intact. Secure-shell suite: 20/20 passed; types, test types, lint, and formatting passed | 2026-08-26 |
| CAP-001 targeted deletion hosted validation | [PR #10](https://github.com/adamlow-wire/wire-desktop/pull/10) merged as `efac1b46`: build/test, lint, CodeQL, Windows/macOS/Linux packages, authenticated Windows/macOS E2E, and merged report passed | 2026-09-02 |
| Upstream synchronization local validation | Integrated upstream `6f9b6a99`; ported secure-shell startup through upstream's split main-process entrypoint; application/test types and lint passed, Jest 19/19 suites and 63/63 tests passed, renderer 2/2 and build tools 35/35 passed, and Electron main coverage passed with 160 tests plus 3 owned CAP-002 targets pending. Copy-aware changed-code coverage initially failed at 44.93%, then passed unchanged at 471/588 statements (80.10%) after sensitivity-proven deletion, download, log-write, cleanup, and collision characterization | 2026-09-02 |
| GOV-001 upstream synchronization hosted validation | [PR #11](https://github.com/adamlow-wire/wire-desktop/pull/11) merged as `2e641a46`: build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and merged report passed in run `33656582101` | 2026-09-02 |
| TST-003 local tray characterization | Commit `a0c91987`: focused tray tests 9/9 and full Electron main coverage 164 passing with 3 owned CAP-002 targets pending; types, lint, formatting, and changed-statement coverage (27/31, 87.10%) passed. Temporary macOS/non-macOS platform mutations failed the intended tests and were reverted | 2026-09-02 |
| TST-003 hosted validation | [PR #12](https://github.com/adamlow-wire/wire-desktop/pull/12) merged as `37f8b5e3`: build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and merged report passed | 2026-09-02 |
| SEC-002 hosted view-authority validation | [PR #13](https://github.com/adamlow-wire/wire-desktop/pull/13) merged as `0281c134`: build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and merged reports passed in runs `33669377166`, `33669377078`, and `33669377162` | 2026-09-02 |
| SEC-003 typed-IPC foundation | Clean full coverage: 186 Electron main tests passing with 3 owned CAP-002 targets pending; changed statements 23/23 and changed security branches 20/20. Moving payload validation before sender authorization failed the strengthened ordering test and was reverted. The capability matrix was reviewed and remains unchanged because this slice migrates only the secure-shell proof channel | 2026-09-02 |
| SEC-003 typed-IPC foundation hosted validation | [PR #14](https://github.com/adamlow-wire/wire-desktop/pull/14) merged as `63f7fa9b`: build/test, lint, CodeQL, Windows/macOS/Linux package baselines, authenticated Windows/macOS E2E, and merged reports passed in runs `33678117522`, `33678117108`, and `33678161971` | 2026-09-02 |
| SEC-003 safe-storage contract | Focused security tests pass 7/7; clean full coverage passes with 190 Electron main tests plus 3 owned CAP-002 targets pending, 48/51 changed statements (94.12%), and 28/28 changed security branches (100%). The versioned account-only encrypt/decrypt contracts authorize registered view identity before bounded request validation, validate bounded responses, rate-limit each operation per view, and preserve legacy byte conversion. Unsafe schema and quota-consumption perturbations failed the intended tests and were reverted; rejected requests are proven not to reach the key-store boundary. Hosted validation remains pending | 2026-09-02 |

## Handoff notes

- Do not claim independent review in the solo-maintainer model. The maintainer's PR merge is the recorded product/security/architecture decision.
- Do not enable the three SSO `security-target` tests by weakening their assertions. CAP-002 owns making them pass.
- PR #6 contains a sensitivity-proven regression test for Linux packaging error propagation; do not restore the prior catch-and-log behavior.
- PR #6 also contains sensitivity-proven Electron 43 unread-state compatibility tests; hidden accounts may increase but not clear unread state until visible.
- ARC-002 is a proof path, not a claim that legacy `@electron/remote`, `<webview>`, or broad IPC has been removed globally. CAP-001 begins migration; the global security work items remain open until the fallback is removed.
- PR #10 completes targeted secure partition deletion. CAP-001 still does not route production account actions and account-targeted events through the secure collection.
- The native MSI feature is part of upstream `dev` and integration through merged PR #9; do not treat it as a pending side branch.
- Electron 44 is available but intentionally deferred. Do not change the `43.4.0` pin during M3; resolve Windows ia32 scope before the next runtime upgrade.
- PR #2 was intentionally closed without merge on 2026-08-20. Do not recreate its credential normalizer or preflight unless evidence from the authoritative vault value demonstrates a real defect.
- The authoritative `BackendConnection staging` values work. Do not add credential normalization or workarounds without new evidence of a credential defect.
- Local Linux is useful for build/unit/integration filtering but cannot currently replace the hosted E2E gate: the wrapper opens and the expected `<webview>` page is not surfaced as a second Playwright window.
- The safe-storage SEC-003 slice does not complete DCP-016: account sender authorization is enforced, but cross-account ciphertext ownership and packaged platform key-store behavior remain unproved.
- Existing ignored validation worktrees under `wrap/` are user artifacts. Preserve them and exclude `wrap/` when invoking Jest locally; clean CI checkouts do not contain them.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
