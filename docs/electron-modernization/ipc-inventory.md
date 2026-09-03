# Privileged incoming IPC inventory

This is SEC-003's completion checklist for renderer-to-main authority. A row is complete only when the channel has a fixed versioned contract, registered sender capability, origin/view policy, request and response schemas, failure policy, and positive plus deny-path tests.

Main-to-renderer notifications and guest `sendToHost` events are outside this table; their exposed bridges and shell trust decisions remain owned by SEC-005 and SEC-007. `ABOUT.SHOW` and `WRAPPER.UPDATE` currently have no renderer producer and are classified as internal/dormant rather than silently counted as migrated.

| Operation | Current expected sender | Risk / side effect | State | Owning follow-up |
| --- | --- | --- | --- | --- |
| `wire-desktop:secure-shell:runtime-info:v1` | secure account proof | Runtime metadata read | merged in PR #14 | SEC-003 |
| `wire-desktop:safe-storage:encrypt:v1` | account | OS key-store encryption | merged in PR #15 | SEC-003, DCP-016 |
| `wire-desktop:safe-storage:decrypt:v1` | account | OS key-store decryption | merged in PR #15 | SEC-003, DCP-016 |
| `wire-desktop:managed-config:read:v1` | account | Enterprise policy read | merged in PR #16 | SEC-003, CAP-005 |
| `wire-desktop:save-picture:v1` | account context action | Network-sized bytes, native dialog, file write | merged in PR #17 | SEC-003, SEC-004 |
| `wire-desktop:notification:activate:v1` | account | Global window activation | merged in PR #18 | SEC-003, CAP-004 |
| `wire-desktop:webapp:loaded:v1` | account | Flushes global queued actions | merged in PR #19 | SEC-003, CAP-001 |
| `wire-desktop:badge-count:update:v1` | application shell | Tray, badge, dock, and flashing state | merged in PR #20 | SEC-003, CAP-004 |
| `wire-desktop:account:delete-data:v1` | application shell | Exact-target session, partition, and log deletion | merged in PR #21 | SEC-003, CAP-001 |
| `wire-desktop:wrapper:reload-request:v1` | account | Reloads all account content through the application shell | merged in PR #22 | SEC-003, CAP-001 |
| `wire-desktop:wrapper:relaunch-request:v1` | account | Relaunches the application or reloads account content on macOS | merged in PR #23 | SEC-003 |
| `wire-desktop:open-graph:fetch:v1` | account | Main-process network fetch | merged in PR #24; destination policy remains open | SEC-003, SEC-012 |
| `wire-desktop:download-location:update:v1` | account | Directory creation and persistent settings write | merged in PR #25; path policy remains open | SEC-003, CAP-005 |
| `wire-desktop:desktop-sources:enumerate:v1` | account | Enumerates display/window capture sources | merged in PR #26; user-gesture policy remains open | SEC-003, SEC-009, CAP-003 |
| `wire-desktop:deep-link:submit:v1` | application shell | Protocol/action dispatch | merged in PR #27; parser and lifecycle policy remain open | SEC-003, SEC-013, CAP-006 |
| `wire-desktop:sso-window:close:v1` / `wire-desktop:sso-window:focus:v1` | owning account | Controls the account-owned SSO window | merged in PR #29 | SEC-003, CAP-002 |
| `wire-desktop:webapp-versions:report:v1` | account | Supplies combined About-window version state | PR #30 validation pending | SEC-003 |
| `wire-desktop:about:locale-read:v1` | About window | Bounded localized resource lookup | PR #30 validation pending | SEC-003 |
| `PROXY_PROMPT.LOCALE_VALUES` | proxy prompt | Localized resource lookup and reply | unmigrated | SEC-003, CAP-005 |
| `PROXY_PROMPT.SUBMITTED` / `PROXY_PROMPT.CANCELED` | active proxy prompt | Proxy credentials, session policy, reload | unmigrated | SEC-003, CAP-005 |
| `ABOUT.SHOW` | native menu only | Opens privileged auxiliary window | internal event; no renderer producer | retain internal or replace direct call |
| `WRAPPER.UPDATE` | none found | Installs a downloaded update | dormant listener; no renderer producer | remove or constrain under PKG-002 |

When a migration changes a row, update this file in the same PR. Search evidence must include all production `ipcMain.on`, `ipcMain.once`, and `ipcMain.handle` registrations plus contract binders so wrapper helpers cannot hide an endpoint.
