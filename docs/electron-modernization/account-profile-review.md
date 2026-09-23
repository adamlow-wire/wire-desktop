# Account profile persistence and state review — September 22

Reviewed production at5eef88e6 with later test-onlyf5ae6ede. This does not resolve F-012 ciphertext ownership, released-profile compatibility or native migration qualification.

## Profile validation and replacement

AccountProfile bounds serialized UTF-8 JSON to2MiB, account count to the supplied maximum, and records through strict non-coercing Joi validation. Unknown legacy fields are stripped. IDs/session IDs are UUIDv4; duplicate IDs and partitions are compared case-insensitively, including the shared default partition. Backend URLs use the existing network navigation policy. Ambiguous selection rejects; absent selection chooses the first record; account indices are rebuilt and transient badge/lifecycle state is reset.

read() treats only ENOENT as absence; malformed JSON, unsupported version, oversized and unreadable existing profiles reject. importLegacy never replaces an existing valid profile, including an empty one. Writes validate/serialize before filesystem mutation, create a random exclusive temporary file with0600 mode in a0700 parent, write and fsync the file, close it, then rename over the destination. Finally removes an owned leftover temporary file. Existing tests cover fsync/rename failure and keeping previous bytes. The directory is not fsynced here, and stat/read are separate operations; this is not proof of crash/power-loss durability, race-free filesystem containment or Windows ACL behavior.

## Main-owned state

AccountState clones initial/read values, derives fresh IDs/partitions for new accounts, preserves selected/retained sessions, and persists a cloned next state before assigning it internally. Failed persistence cannot publish the proposed transition. Removal is intentionally called only after controller-owned data disposal; AccountState itself does not clear native data. It selects the last survivor or creates a fresh empty account. Snapshots remove sessionID, ssoCode and conversationJoinData and freeze the display records/array; this is a defined display contract, not arbitrary metadata redaction. Named events and account limits remain subject to controller/IPC authorization before reaching this owner.

Pending SSO/join metadata can exist in the profile. No encryption or compatibility policy is changed by this review. The separate legacy reader uses native debugger/storage APIs; it is not exercised by these Node tests.

## Evidence and provenance

Profile source/tests originate together in11b3e46b; state source/tests together in331f0a41. Subsequent state/event/controller/SSO changes1473439e/e6e71ce4/bb46ddea/aa9e612a retain their individual provenance. Join-domain compatibility correction7c4aa2c3 and ELC-003 Joi migrationabae1a66 are later changes. Preserve ELC's separate pre-migration156b601f evidence; this focused run is not a replacement full renderer/schema qualification.

Later test-onlyf5ae6ede writes a real partial temporary file through an injected write failure, asserts exact original failure and previous profile bytes, confirms temporary cleanup, then retries successfully. A temporary test-only overlay on5eef88e6 passes38 profile/state Node cases. Removing fsync, truncating the previous file before completion, bypassing duplicate partition validation, publishing memory before persistence and retaining sessionID in snapshots each make the suite fail. All source/test overlays are restored;38 cases pass on restored source with the later test. Electron test types and targeted lint pass. The checkout is clean. No native process or user profile is touched; filesystem tests own their temporary directories.

```sh
node node_modules/mocha/bin/mocha.js --require .babel-register.js electron/src/accounts/{AccountProfile,AccountState}.test.main.ts
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.mocha.json
node node_modules/eslint/bin/eslint.js electron/src/accounts/AccountProfile.test.main.ts
```

Logs `/tmp/tst006-profile-review-{tests,restored,types,composed-lint}.log` and `/tmp/tst006-profile-{sync,partial,partition,publish,snapshot}-sensitivity.log`. All commands use the composed overlay because the report checkout predates the Joi dependency migration.

Frozen inventory remains5eef88e6/492 paths until this later test is reconciled. Remaining: full controller/profile/native storage composition, filesystem/platform durability and migration evidence, selected profile compatibility policy/ciphertext ownership, and all final platform/E2E/package gates. Partial reviewed rows are not accepted completion.

## Reconciled recovery test

Current68ce2478 includesf5ae6ede exactly.48 profile/state/cleanup-order/retired IPC Node cases, Electron test types and targeted lint pass. Frozen inventory492 exact paths now matches this target; the preceding pending-reconciliation note is historical. Production and all native/compatibility/ciphertext limitations above remain unchanged.

## Scoped legacy-reader cleanup correction

Review of readLegacyAccountState at68ce2478 finds setup outside cleanup and debugger detach failure skipping window destruction. CAP-001 baseline8dacee5c reproduces8 passing controls/3 failing guard/detach targets using the actual source initializer and inert native ports. Scoped0c7152bf moves setup under try/finally and ensures destruction is attempted even if detach fails.11 cases pass; restoring setup/detach defects fails2/1, then source restored. Two-file composed68ce2478 overlay passes11 tests, Electron/production types and lint; all overlay files restored.

This does not change profile import or ciphertext policy. Native storage/window/debugger cleanup remains unqualified; destroy itself throwing is outside the new guarantee. Frozen target/inventory remains68ce2478/492 paths pending candidate reconciliation. Scoped evidence: `/tmp/wire-cap001-reader-cleanup/docs/electron-modernization/cap001-reader-cleanup.md`; logs `/tmp/cap001-reader-composed-{tests,types,production-types,lint}.log`.

## Reader correction reconciled

Currentb2a72752 includes0c7152bf exactly.59 Node profile/state/cleanup/reader/retired IPC cases, Electron/production types and targeted lint pass. Inventory493 paths matches exactly; new reader entries retain native-test limits. The earlier pending-composition note is historical. Actual native debugger/storage/window qualification and compatibility/ciphertext decisions remain open.
