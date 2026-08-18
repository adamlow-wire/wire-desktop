---
project: WIRE-DESKTOP-ELECTRON-MODERNIZATION
updated: 2026-08-18
milestone: M0
active_work_item: GOV-001
state: setup
integration_branch: integration/electron-modernization
integration_base_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
published_head: 567be7646a61fdd725f7fdb693880a294d65d155
fork_url: https://github.com/adamlow-wire/wire-desktop
publication: published
upstream_commit: e1ba98c50dce28b26b05466169fbdf941f0285f3
related_pending_branch: feature/WPB-5221-windows-native-msi
next_work_item: BASE-001
blockers:
  - GOV-001 requires hosted branch protection and required checks; GitHub CLI authentication must be renewed to configure them
---

# Current project status

## Current outcome

The structured plan and durable AI/human project scaffolding are committed and published to the existing `adamlow-wire/wire-desktop` fork. The branch is isolated on Wire's current `origin/dev` rather than the separate unmerged MSI feature history. Hosted branch protection and required checks remain before GOV-001 is complete.

## Active work

| Field | Value |
| --- | --- |
| Work item | GOV-001 — Establish fork and integration workflow |
| Owner | `adamlow-wire` |
| Branch | `integration/electron-modernization` |
| Goal | Create and publish the fork/integration workflow without modifying upstream history |
| Completion evidence | [Published branch](https://github.com/adamlow-wire/wire-desktop/tree/integration/electron-modernization), remotes, branch protection state, and recorded upstream base |

## Next executable sequence

1. Renew GitHub CLI authentication, configure branch protection/required checks, and finish GOV-001.
2. Run BASE-001 without changing application behavior.
3. Create the capability acceptance matrix details under BASE-002.
4. Begin TST-001 and TST-002 so coverage and SSO behavior are trustworthy before architecture replacement.
5. Run ELC-001 from the verified baseline, then upgrade Electron one major at a time under ELC-002.

## Last verified state

| Check                     | Result                                    | Date       |
| ------------------------- | ----------------------------------------- | ---------- |
| Plan formatting           | `prettier --check` passed                 | 2026-08-18 |
| Work item identifiers     | Unique                                    | 2026-08-18 |
| Work item dependencies    | All identifiers resolve; graph is acyclic | 2026-08-18 |
| Integration publication   | Branch pushed to `adamlow-wire` fork      | 2026-08-18 |
| Application test baseline | Not yet executed under this project       | —          |
| Packaged baseline         | Not yet executed under this project       | —          |

## Handoff notes

- Do not begin Electron or security implementation until the current application test/build baseline is recorded.
- The first tests should characterize high-risk behavior rather than chase a global coverage percentage.
- The modernization branch is based on `origin/dev`; the separate MSI feature must arrive through normal upstream synchronization after it is merged.
- Update this file in place; retain only information needed to resume accurately. Durable historical outcomes belong in the plan change/decision logs and PRs.
