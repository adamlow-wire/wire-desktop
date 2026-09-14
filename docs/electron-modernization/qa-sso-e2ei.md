# Live SSO and E2EI QA handoff

Status: **not run; customer compatibility is unqualified**.

On September 14 the maintainer moved live environment discovery/provisioning and live SSO/E2EI acceptance out of M3 automated acceptance, to a later QA checkpoint. Keycloak is the customer's identity provider. This changes test scheduling, not application security policy. Desktop tests cannot prove provider configuration, OIDC state/token validation, ACME issuance or webapp/core certificate persistence and renewal.

## Prerequisites

- Record desktop commit/package, Electron version, OS, webapp/backend versions, and relevant Keycloak/ACME versions and configuration identifiers.
- Use a dedicated non-production team with working enterprise SSO and E2EI features, plus two identities/accounts for isolation checks. SSO and E2EI may require different provider configuration; do not assume one successful login qualifies both.
- Obtain OIDC discovery/client/redirect configuration and ACME directory through the environment owner. Keep credentials and tokens in the approved secret store, outside reports/source/chat.
- Agree a supported renewal trigger or short certificate lifetime with the environment owner; record how renewal was induced. Do not change the host clock or certificate validation to force a pass.

## Required cases

| Case | Expected evidence |
| --- | --- |
| Enterprise SSO success | Actual provider authentication returns a backend success verdict to the intended account; correct account opens. |
| SSO cancellation and provider/backend failure | No false authenticated state, no cookie transfer to another account, owned SSO window cleaned up, retry works. |
| First E2EI enrolment | Actual Keycloak OIDC flow and ACME issuance complete; app displays verified device/identity and certificate details. Capture non-secret issuer/expiry/device identifiers. |
| Native quit and restart | Same account/device remains correctly verified with the expected certificate; no unexplained re-enrolment or identity replacement. |
| Renewal | Supported trigger results in renewed certificate; record old/new expiry and identity continuity. |
| Silent authentication unavailable | App either completes an authorized interactive fallback or presents a recoverable failure; no false verification or cross-account authentication. |
| Cancel enrolment / unavailable provider / issuance failure | No false success or new verified certificate; pre-existing valid identity is not incorrectly attributed or lost. Recovery works after the failure is removed. |
| Concurrent accounts and stale callbacks | Complete/cancel one flow while another account is selected; results stay with the initiating account. Replay, stale or foreign-account callbacks never authenticate another account. |
| OS coverage | Run enrolment/restart and the applicable SSO/renewal flows on Windows, macOS and Linux packages. Record platform-specific limits explicitly. |

## Result record

For each case record pass/fail/not-run, environment and exact build, reproduction steps, expected/actual result, sanitized evidence, defect link and tester/date. A not-run case is an open qualification gap. Do not attach access tokens, passwords, private keys or complete callback URLs containing secrets.

QA signs off DCP-003/DCP-022 live compatibility only after these results are reviewed. M3's automated test result is not that sign-off. No permissive navigation, TLS bypass, extra renderer privilege or shared production identity may be introduced to make a test pass.
