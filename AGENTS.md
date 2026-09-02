# Repository agent guidance

## Electron modernization work

Before changing Electron architecture, security boundaries, tests, packaging, installers, or update behavior, read these files in order:

1. `docs/electron-modernization/README.md`
2. `docs/electron-modernization/status.md`
3. `docs/electron-modernization/plan.md`
4. `docs/electron-modernization/testing.md`
5. `docs/electron-modernization/capabilities.md`
6. `docs/electron-modernization/ipc-inventory.md`

The plan's work item register and security invariants are authoritative. Do not create an overlapping task when an existing work item can be updated.

## Working method

- Work on one primary work item per branch and PR.
- Preserve user changes and avoid unrelated cleanup.
- Add or strengthen characterization tests before changing established behavior.
- Prove a new characterization test is sensitive to the behavior it protects. Use a temporary local perturbation, observe the expected failure, then revert the perturbation before committing.
- Commit baseline tests separately from implementation when practical.
- Do not weaken an assertion merely to make a new implementation pass. If intended behavior changes, update the plan and capability contract explicitly.
- Prefer small policy modules, typed boundaries, and direct tests over framework or abstraction layers without a demonstrated need.
- Record commands and durable CI/PR links as evidence. Do not commit bulky generated reports.
- Update `docs/electron-modernization/status.md` before handing work to another human or agent.

## Security constraints

- Do not weaken a security invariant in `docs/electron-modernization/plan.md` without an approved, expiring exception recorded in that plan.
- Remote content must be treated as potentially compromised.
- New privileged IPC requires sender authorization, payload validation, and positive and negative tests.
- New navigation, permission, protocol, session, or external-link behavior must fail closed and include deny-path tests.

## Completion

A modernization work item is complete only when its acceptance criteria are satisfied, evidence is recorded, relevant tests pass, the capability matrix is current, and the handoff status identifies the next executable work.
