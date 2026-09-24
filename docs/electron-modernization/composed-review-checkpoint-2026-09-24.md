# TST-006 composed review checkpoint — September 24

Base: exact unsigned package candidate `572bbf25b327ebd91aa9dd98fe0eed1d47521a28` from fork draft PR #63. This branch composes only the source/test changes from [CAP-005 PR #66](https://github.com/adamlow-wire/wire-desktop/pull/66), [CAP-005 PR #67](https://github.com/adamlow-wire/wire-desktop/pull/67) and [SEC-003 PR #68](https://github.com/adamlow-wire/wire-desktop/pull/68), plus PR #67's explicit plan/capability contract update. The separate PRs retain their failing baselines and review history. No branch is merged into integration.

| Finding | Composed behavior | Local evidence and limit |
| --- | --- | --- |
| F-032 | A failed Windows download-location settings write restores the previous in-memory value. | 13 focused Node cases pass. Native Windows and final persistence interaction remain unqualified. |
| F-033 | Windows App-lock override requires explicit enabled Wire policy; generic MDM/Entra state does not grant it. | 22 inert backend fixture cases pass. Actual Windows policy readback remains unqualified. |
| F-034 | Authorized IPC requires the registered sender frame to remain the current main frame. | 29 representative common/account/event/crypto IPC cases pass. The new real-Electron initial-load/same-origin test is authored and type/lint checked but unrun; no detached-frame exploit is claimed. |

Full root TypeScript, scoped ESLint, Prettier and `git diff --check` pass on the composed source. The first combined inert Mocha invocation was invalid because the local worktree's `node_modules` symlink made Mocha import the Electron fixture as ESM; separate runs using the exact installed candidate dependency path pass 13, 22 and 29 cases. This is a fixture-resolution issue, not a product test failure. Hosted native/package qualification is the next gate. The full TST-006 inventory, baseline provenance, coverage, F-012 ownership and other upstream changes remain open; this checkpoint is not final handoff acceptance.
