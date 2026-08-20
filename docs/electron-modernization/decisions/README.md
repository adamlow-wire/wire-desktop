# Architecture decision records

Detailed decisions live in this directory. The compact decision register in `../plan.md` remains the index and records status.

## File naming

Use `NNNN-short-kebab-title.md`, beginning with `0001`. Do not renumber accepted or superseded records.

## Required template

```markdown
---
decision_id: DEC-NNN
adr: NNNN
status: proposed | accepted | superseded | rejected
date: YYYY-MM-DD
owners: [name-or-role]
work_items: [ID]
invariants: [INV-NNN]
supersedes: []
---

# Decision title

## Context

Facts, constraints, and the decision that must be made.

## Options considered

Only credible alternatives and their material trade-offs.

## Decision

The selected option and precise boundaries.

## Consequences

Positive, negative, migration, security, and operational consequences.

## Validation

Tests, spike results, benchmarks, or review required to keep the decision accepted.

## Revisit conditions

Concrete evidence or external changes that require reconsideration.
```

ADRs should be short. Link supporting experiments or PRs instead of embedding transcripts and generated output.
