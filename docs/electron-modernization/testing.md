# Baseline-first testing strategy

## Purpose

The modernization changes code that few people understand and that integrates with operating systems, identity providers, remote web content, installers, and update systems. Tests are therefore the primary control for preserving required behavior while replacing unsafe implementation mechanisms.

This is characterization-driven development followed by test-driven implementation:

1. Establish what the current application does and which behavior is required.
2. Add a test that passes against the current implementation.
3. Prove the test would fail if the protected behavior were broken.
4. Change the implementation while keeping the contract test unchanged.
5. Add security tests for behavior that the legacy implementation does not satisfy.

Existing behavior is not automatically correct. Security invariants describe the required target even when the corresponding target test initially fails.

## Test classifications

Every added modernization test MUST be classified in its name, enclosing suite, or PR evidence as one of:

- `characterization`: Captures required existing product behavior and initially passes.
- `security-target`: Expresses a required invariant and MAY initially fail on the legacy shell.
- `regression`: Prevents recurrence of a confirmed defect.
- `compatibility`: Protects an Electron, operating-system, packaging, or dependency transition.
- `migration`: Protects user data or installation state across versions.

## Characterization workflow

For each behavior:

1. Link the behavior to a capability ID in `capabilities.md` and a plan work item.
2. State the contract in observable terms, including supported platforms and important exclusions.
3. Choose the lowest test layer that proves the contract without coupling to private implementation.
4. Run the new test against the unchanged implementation and record the passing command/result.
5. Prove sensitivity using a temporary perturbation, such as replacing the expected action with a no-op or changing a decision outcome.
6. Run the test and observe the expected failure for the intended reason.
7. Revert the perturbation and confirm the test passes again.
8. Commit the test without the perturbation, preferably before the implementation commit.

The sensitivity check is evidence, not committed sabotage. Record a concise description and command in the PR; do not commit temporary mutation code or bulky test output.

## Security-target workflow

Security-target tests describe desired behavior and can expose a known legacy failure:

1. Link the test to one or more security invariant IDs.
2. Demonstrate the legacy result and label it explicitly as expected legacy failure.
3. Keep legacy-failing tests out of mandatory CI only through a narrow, named quarantine with an owner and removal work item.
4. Make the test mandatory in the same PR that implements the invariant.
5. Include positive authorization and negative/hostile cases.

Do not encode insecure legacy behavior as a characterization contract.

## Required layers

| Layer | Best suited to | Required qualities |
| --- | --- | --- |
| Pure unit | Parsing, schemas, origin and permission decisions | Fast, deterministic, table-driven deny cases |
| Electron integration | Effective preferences, IPC identity, sessions, windows/views | Uses real Electron behavior where mocks could hide privilege |
| Hostile renderer | Boundary enforcement | Attempts raw IPC, navigation, popup, Node access, and cross-account access |
| Development E2E | Product flows | Fresh user data, deterministic accounts, retained traces on failure |
| Packaged smoke | Fuses, signing, protocols, tray, permission behavior | Runs the artifact that would be distributed |
| Installer/update | Install and migration state | Fresh install, upgrade, repair where applicable, uninstall, rollback |
| Manual/platform | Native UI that cannot be trusted to mocks alone | Scripted checklist with artifact/version evidence |

## Quality rules

- Tests MUST assert an observable outcome, not merely that a mock was called, when the outcome is practical to observe.
- Mocks MAY isolate operating-system effects, but at least one higher-level test MUST cover each critical integration.
- Time, network, identity-provider, and platform dependencies MUST be controlled or explicitly declared.
- Tests MUST use fresh per-test account/session data unless persistence is the contract under test.
- Deny-path tests MUST verify no privileged side effect occurred.
- Flaky tests MUST NOT be hidden with unbounded retries. Quarantine requires an owner, reason, issue, and expiry.
- Updating a characterization assertion during migration requires an explicit capability-contract or scope change.
- Coverage percentages are supporting signals. Capability and invariant coverage are release gates.

## Initial priority

The first baseline additions should be:

1. SSO protocol validation, ephemeral session lifecycle, cookie transfer, and cleanup.
2. View/session identity and cross-account isolation.
3. Privileged IPC inventory with authorized, unauthorized, and invalid-payload cases.
4. Navigation, popup, external-link, and deep-link policy.
5. Certificate verification and exception behavior.
6. Permission decisions for camera, microphone, display capture, and notifications.
7. Tray/menu/badge platform branches.
8. Updater/installer selection and migration behavior.

## Evidence required in a modernization PR

```yaml
test_evidence:
  work_items: [TST-NNN, CAP-NNN]
  capabilities: [DCP-NNN]
  invariants: [INV-NNN]
  baseline_command: <command or not-applicable>
  baseline_result: <pass/fail and durable CI link when available>
  sensitivity_check: <temporary perturbation and expected failure>
  target_command: <command>
  target_result: <pass/fail and durable CI link when available>
  platforms: [windows, macos, linux]
  gaps: []
```

Only list platforms actually exercised. Unrun platforms are gaps, not implicit passes.

## Validation cadence during M3

Every PR must pass its focused characterization/security tests and the protected branch's required build, lint, and analysis checks. Authenticated cross-platform E2E is required when a PR changes observable product behavior, activates a new production boundary, or closes an M3 execution checkpoint. A schema-only migration inside an already characterized boundary may defer authenticated E2E to the next checkpoint when the PR records that gap; this reduces duplicated staging runs without weakening the M3 exit gate.
