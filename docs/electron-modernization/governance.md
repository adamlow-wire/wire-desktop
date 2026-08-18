---
document_id: WIRE-DESKTOP-ELECTRON-MODERNIZATION-GOVERNANCE
status: active
updated: 2026-08-18
work_items: [GOV-001]
---

# Fork and integration workflow

## Repository topology

| Role | Name | URL or branch | Rule |
| --- | --- | --- | --- |
| Upstream | `origin` | `git@github.com:wireapp/wire-desktop.git` | Read/synchronize; modernization work is not pushed directly here |
| Fork | `fork` | `git@github.com:adamlow-wire/wire-desktop.git` | Hosts reviewed modernization work |
| Upstream base | `origin/dev` | `e1ba98c50dce28b26b05466169fbdf941f0285f3` | Recorded starting point; later upstream commits enter by merge |
| Integration | — | `integration/electron-modernization` | Shared, non-rebased history; final PR source |
| Pending MSI work | — | `feature/WPB-5221-windows-native-msi` | Remains separate until it reaches `origin/dev` through normal review |

The published integration branch is [available on the fork](https://github.com/adamlow-wire/wire-desktop/tree/integration/electron-modernization).

## Change flow

1. Branch from the current integration head using a work-item ID, for example `tst/TST-002-sso-characterization`.
2. Keep the branch to one primary work item and commit characterization tests separately from behavior changes where practical.
3. Open a PR to `integration/electron-modernization` using the modernization template.
4. Require green `Build and Test`, `Lint`, and `CodeQL` checks. Run platform/package jobs when the affected capability requires them.
5. Require at least one desktop maintainer review. Security-boundary changes also require a security-owner review.
6. Merge without rewriting shared integration history. Direct pushes to the integration branch are prohibited once hosted protection is enabled.

## Upstream synchronization

Run synchronization as its own reviewed PR when practical:

```bash
git fetch origin
git fetch fork
git switch integration/electron-modernization
git pull --ff-only fork integration/electron-modernization
git merge --no-ff origin/dev
```

Resolve conflicts in the synchronization branch, run the baseline, record the new upstream commit in `plan.md` and `status.md`, then push through the fork PR workflow. Do not rebase the published integration branch.

## Hosted controls

The desired branch rule is:

- Require a pull request with one approval and dismissal of stale approvals.
- Require code-owner review when ownership is defined.
- Require `Build and Test`, `Lint`, and `CodeQL` to pass and the branch to be current.
- Block force pushes, deletion, and direct administrator bypass except an audited emergency procedure.

On 2026-08-18 the rule was applied and read back through the GitHub API. It requires one approval with stale-review dismissal, strict `Build and Test`, `lint`, and `Analyze (javascript)` checks, resolved conversations, and blocks force pushes and deletion. Administrator enforcement is enabled after the bootstrap evidence commit, so subsequent changes must use the PR workflow. Named ownership remains an M0 approval dependency under Q-008 rather than a reason to weaken the hosted rule.
