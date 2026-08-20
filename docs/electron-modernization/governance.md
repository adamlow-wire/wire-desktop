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
5. The solo maintainer reviews the PR diff, test evidence, security invariants, and unresolved risks before merging. The merge is the recorded approval; do not claim independent review.
6. Security-boundary changes require a distinct security-review pass recorded in the PR, even when performed by the same maintainer with AI assistance.
7. Merge without rewriting shared integration history. Direct pushes to the integration branch are prohibited.

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

- Require a pull request. The approval count is zero because GitHub prevents a solo PR author from approving their own PR.
- Require `Build and Test`, `Lint`, and `CodeQL` to pass and the branch to be current.
- Require resolved conversations and block force pushes, deletion, and administrator bypass.

On 2026-08-18 the original directly populated integration branch was replaced by a clean active branch at upstream commit `e1ba98c50dce28b26b05466169fbdf941f0285f3`; its temporary archive was deleted after verifying that PR #1 preserved every M0 commit. PR #1 now contains the complete M0 delta. GitHub API readback confirms PR enforcement with zero external approvals, strict `Build and Test`, `lint`, and `Analyze (javascript)` checks, resolved conversations, and no administrator bypass, force pushes, or deletion.

This is deliberately a solo-maintainer workflow. Quality comes from small PRs, explicit acceptance criteria, sensitive-test demonstrations, required CI, and recorded review notes—not ceremonial reviewer requirements that cannot be satisfied.
