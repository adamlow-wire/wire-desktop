---
decision_id: DEC-010
adr: 0003
status: proposed
date: 2026-09-10
owners: [adamlow-wire]
work_items: [SEC-010, CAP-001]
invariants: [INV-003, INV-004, INV-008, INV-010]
supersedes: []
---

# Bounded local application content

## Decision

Extend the existing `wire-app` scheme foundation to production local content. Serve only fixed shell, About and proxy-prompt assets through their owning sessions. Resolve named assets against the main-selected application directory; never append a renderer-supplied path to a filesystem root. Permit GET/HEAD only, reject ambiguous URLs and unknown resources, return correct MIME types, and conceal filesystem errors behind a bounded failure response.

Preserve sandboxing, isolated preloads, current CSP and exact registered document identity. Protocol privileges must not bypass CSP, enable service workers or expose filesystem access. Each auxiliary session retains its narrower resource allowlist. Preloads remain main-selected filesystem paths, not protocol assets.

## Migration

CAP-001 moves account state into a main-owned profile and retains existing account partitions. Before ordinary startup uses the new shell origin, import legacy state through the existing script-disabled, hidden file-origin reader. This migration-only reader does not run application content; it must be skipped once the versioned profile exists. Do not delete old storage or change remote account origins as part of the scheme migration.

## Alternatives and validation

Continuing normal `file://` loading does not satisfy SEC-010. A generic static-file server exposes unnecessary assets and path parsing; use a finite resource map instead. Baseline tests already protect the real shell/CSP, relative auxiliary CSS/logo and legacy-state reader. Add path/method/session deny tests, actual protocol resource loading, ordinary-script CSP denial and product profile/restart evidence before acceptance. No platform or migration gate is waived by this proposal.

Native transport evidence confirms that relative resources need pre-ready standard-scheme registration, consistent with [Electron's protocol documentation](https://www.electronjs.org/docs/latest/api/protocol). Only `standard` and `secure` are enabled: streaming, service workers, CSP bypass, fetch support, CORS and code cache are disabled. All three normal local windows now use the scheme in the local candidate. Linux lifecycle/metadata restart, exact auxiliary identity/resource tests, and production/development ordinary-script CSP targets pass. A test-only CSP relaxation makes the constant eval/Function probes succeed and fails the deny assertion. Final review, coverage and platform qualification remain open; this ADR is not yet accepted.
