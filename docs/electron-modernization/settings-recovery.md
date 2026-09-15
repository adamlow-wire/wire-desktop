# Settings preservation and unsigned recovery fixtures

Owner: PKG-003 / DCP-021, brought forward to remediate TST-006 F-010. This procedure does not qualify migration from every supported release or complete M5.

## Contract

- `config/init.json` is authoritative when it exists. A leftover root `init.json` must never overwrite it, even when either file is corrupt.
- When only the legacy file exists, parse an object before changing files. Preserve existing settings, including `fullscreen` and `bounds`, and supply the existing version default without mutating shared defaults.
- Write complete bytes into a unique private file in the destination directory, flush and close it, then publish it exclusively. Delete the legacy file only after publication. Filesystems without hard-link support fail safely; no destructive fallback is used.
- Ordinary persistence stages a complete file and replaces the old file only after a successful write/flush/close. A failed save raises a generic error and preserves the previous file. Quit still exits; an environment change must not relaunch after a failed save.
- Only an absent current file gets independent defaults. Corrupt/unreadable files cause a generic failure and remain available for recovery. Parser contents and original filesystem errors must not enter diagnostics.

These operations prevent partial live files and destructive migration. They do not promise survival of arbitrary hardware failure or power loss across all filesystem metadata operations. A process terminated before cleanup can leave a private staging file. Such a file is not loaded as configuration.

## Reproduction

Safe local command, without Electron windows:

```sh
node .yarn/releases/yarn-3.3.1.cjs mocha --require .babel-register.js --require electron/test/node-settings-context.cjs electron/src/settings/SchemaUpdater.test.main.ts electron/src/settings/ConfigurationPersistence.test.main.ts
```

The adapter supplies only an isolated user-data directory and logger for Node. Native CI uses real Electron with no adapter. Both filesystem suites and the Quit/environment/menu failure suites are selected explicitly in `electron-modernization-baseline.yml` for Windows/macOS/Linux. Hosted final-head results are required before acceptance.

Fixtures use synthetic temporary directories. They cover valid migration, actual legacy window keys, current-file precedence, corrupt/non-object data, blocked destination, shared-default isolation, write/flush/publication failure, partial writes, concurrent destination creation and restart after interrupted legacy cleanup. Failure injection is restored before recovery assertions. Separate baseline commits distinguish observed legacy behavior from initially failing security targets.

## Recovery and later QA

1. Stop all processes using the affected profile. Work on a copy and retain a protected backup of the entire user-data directory. Do not experiment on the installed Wire profile.
2. Preserve both `init.json` and `config/init.json`, plus any staging file. Treat their contents as sensitive; do not attach them to public CI logs or issues.
3. If the current file is valid, a leftover legacy file is ignored. If the current file is corrupt, restore a known-good current file from backup. Do not automatically substitute defaults or overwrite it with a leftover legacy file of unknown age.
4. If only a valid legacy file exists and the destination was unwritable, correct access/storage conditions and retry using the copied profile. If legacy cleanup failed after publication, the complete current file remains authoritative on restart.
5. If no trustworthy backup exists, retain the evidence for authorized support recovery. This patch does not invent an automated repair or discard account/session state.

Wire QA still needs an approved released-version/install-type matrix, real upgrade/rollback and managed-configuration checks, and signed-platform qualification. Record exact source/destination versions, OS, install type, fixture origin, execution result and recovery result. Those cases remain unrun until evidenced. The synthetic tests do not establish support for arbitrary older schemas, restore encrypted credentials across machines, or change certificate-pinning policy.
