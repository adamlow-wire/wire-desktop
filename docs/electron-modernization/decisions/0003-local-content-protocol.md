---
decision_id: DEC-010
adr: 0003
status: accepted
date: 2026-09-14
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

Native transport evidence confirms that relative resources need pre-ready standard-scheme registration, consistent with [Electron's protocol documentation](https://www.electronjs.org/docs/latest/api/protocol). Only `standard` and `secure` are enabled: streaming, service workers, CSP bypass, fetch support, CORS and code cache are disabled. All three normal local windows now use the scheme in the local candidate. Linux lifecycle/metadata restart, exact auxiliary identity/resource tests, and production/development ordinary-script CSP targets pass. A test-only CSP relaxation makes the constant eval/Function probes succeed and fails the deny assertion. Final review, coverage and platform qualification are complete through PR #50.

## Acceptance evidence

[PR #50](https://github.com/adamlow-wire/wire-desktop/pull/50) integrates this decision as18235a5a after reviewed head4f867021 passes build/lint/analysis, [Windows/macOS/Linux native/package gates](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857405317), and [authenticated E2E/report](https://github.com/adamlow-wire/wire-desktop/actions/runs/34857460712). macOS has43 initial passes; Windows41 initial/two retry passes, no skips or worker errors. One Windows native setup timeout passes on an unchanged-head retry; the failed attempt remains recorded. The merged tree equals the tested candidate tree. Fixed resource selection, minimal privileges, ordinary-script CSP denial, exact auxiliary session/document identity and legacy-profile/restart behavior were substantively reviewed under the authorized solo-maintainer/Codex model. No security exception or generic filesystem capability is introduced.
