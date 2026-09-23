# Unsigned Linux ASAR package inventory

Status: **partial ELC-003 / PKG-001 evidence**, 2026-09-23. Source is the local composed candidate `2ba7ade3e43bca9c5263c1bf5b7fa8ac54b20acd` (tree `484448fee75fc5d311f3d73b9b35fff8f9f206d635`) on Electron 43.4.0. This is an unsigned Linux `dir` target built with the repository's actual `buildLinuxConfig` and `electron-builder`, without launching the app. It is not an AppImage, deb, rpm, Windows or macOS artifact.

The built `linux-unpacked/resources/app.asar` has SHA-256 `d765a4ce82ec18af069361369c5b092f0977ce4a84fad7c3b50a979986d57a04`. `node bin/test-tools/verify-package-contents.cjs wrap/recovery-artifacts/linux-dir` passes: 7,695 ASAR entries and all 22 required files. The local-only [inventory utility](../../bin/test-tools/inventory-shipped-asar.cjs) finds **423 installed package instances / 366 distinct names**. It accepts only actual `node_modules` package-root manifests; 93 nested `package.json` metadata files lacking name/version are excluded. The four `package.json` files under `app.asar.unpacked` correspond to the same four package paths in the ASAR inventory. The private detailed inventory and unsigned application directory remain in ignored local `wrap/recovery-artifacts/linux-dir`; they are not committed.

The shipped graph includes `uuid` 9.0.1. It matches the version range of [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), but that advisory concerns the supplied-buffer v3/v5/v6 paths; the two reviewed app callers use argument-free v4. This is a **call-site disposition**, not a conclusion about all possible transitive callers. The prior installed-production audit counted 354 instances and found no high/critical advisory matches; it is not a substitute for auditing these 423 shipped instances. A live query of the actual shipped names/versions to npm's public bulk advisory endpoint was rejected by automatic approval review because it would disclose private package metadata. No equivalent complete local advisory database has been established. Therefore **ELC-003's no-unaccepted-high/critical acceptance is still open**. Do not present this artifact as security-cleared.

Reproduce after building the same unsigned Linux directory with the current builder configuration:

```sh
node bin/test-tools/verify-package-contents.cjs wrap/recovery-artifacts/linux-dir
node bin/test-tools/inventory-shipped-asar.cjs wrap/recovery-artifacts/linux-dir/linux-unpacked/resources/app.asar wrap/recovery-artifacts/linux-dir/shipped-packages.json
```

The inventory command reads the ASAR locally, writes its package names/versions to an owner-controlled file with mode `0600`, and prints only hash/counts/path. It makes no network request. The build ran on pinned Node 22.22.3 and locked dependencies. The local build command avoided `build:prepare` because that script clears the shared `wrap` directory containing protected worktrees.

Next ELC-003 work: obtain an approved private/advisory source or explicit approval for the package-metadata query; review the shipped graph and any high/critical matches with reachability and compatible remediation; then repeat on the final composed artifacts. PKG-001/TST-005 must still qualify actual unsigned installers and packaged native startup on all three platforms. The current ASAR does not close either gate.
