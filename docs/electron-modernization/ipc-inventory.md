# Privileged incoming IPC inventory

This is SEC-003's completion checklist for renderer-to-main authority. A row is complete only when the channel has a fixed versioned contract, registered sender capability, origin/view policy, request and response schemas, failure policy, and positive plus deny-path tests.

Main-to-renderer notifications and guest `sendToHost` events are outside this table; their exposed bridges and shell trust decisions remain owned by SEC-005 and SEC-007. `ABOUT.SHOW` and `WRAPPER.UPDATE` currently have no renderer producer and are classified as internal/dormant rather than silently counted as migrated.

| Operation | Current expected sender | Risk / side effect | State | Owning follow-up |
| --- | --- | --- | --- | --- |
| `wire-desktop:secure-shell:runtime-info:v1` | secure account proof | Runtime metadata read | merged in PR #14 | SEC-003 |
| `wire-desktop:safe-storage:encrypt:v1` | account | OS key-store encryption | PR #15 validation | SEC-003, DCP-016 |
| `wire-desktop:safe-storage:decrypt:v1` | account | OS key-store decryption | PR #15 validation | SEC-003, DCP-016 |
| `wire-desktop:managed-config:read:v1` | account | Enterprise policy read | local typed-contract slice | SEC-003, CAP-005 |
| `ACTION.SAVE_PICTURE` | account context action | Network-sized bytes, native dialog, file write | unmigrated | SEC-003, SEC-004 |
| `ACTION.NOTIFICATION_CLICK` | account | Global window activation | unmigrated | SEC-003, CAP-004 |
| `WEBAPP.APP_LOADED` | account | Flushes global queued actions | unmigrated | SEC-003, CAP-001 |
| `UI.BADGE_COUNT` | application shell | Tray, badge, dock, and flashing state | unmigrated | SEC-003, CAP-004 |
| `ACCOUNT.DELETE_DATA` | application shell | Cross-account storage and log deletion | unmigrated | SEC-003, CAP-001 |
| `WRAPPER.RELOAD` | account | Reloads account content | unmigrated | SEC-003, CAP-001 |
| `WRAPPER.RELAUNCH` | account | Relaunches the application | unmigrated | SEC-003 |
| `ACTION.GET_OG_DATA` | account | Main-process network fetch | unmigrated | SEC-003, SEC-012 |
| `ACTION.CHANGE_DOWNLOAD_LOCATION` | account | Directory creation and persistent settings write | unmigrated | SEC-003, CAP-005 |
| `ACTION.GET_DESKTOP_SOURCES` | account | Enumerates display/window capture sources | unmigrated | SEC-003, SEC-009, CAP-003 |
| `ACTION.DEEP_LINK_SUBMIT` | application shell | Protocol/action dispatch | unmigrated | SEC-003, SEC-013, CAP-006 |
| `SSO_WINDOW_CLOSE` / `SSO_WINDOW_FOCUS` | account | Controls shared SSO window | unmigrated | SEC-003, CAP-002 |
| `UI.WEBAPP_VERSION` / `UI.WEBAPP_AVS_VERSION` | account | Supplies About-window version state | unmigrated | SEC-003 |
| `ABOUT.LOCALE_VALUES` | About window | Localized resource lookup and reply | unmigrated | SEC-003 |
| `PROXY_PROMPT.LOCALE_VALUES` | proxy prompt | Localized resource lookup and reply | unmigrated | SEC-003, CAP-005 |
| `PROXY_PROMPT.SUBMITTED` / `PROXY_PROMPT.CANCELED` | active proxy prompt | Proxy credentials, session policy, reload | unmigrated | SEC-003, CAP-005 |
| `ABOUT.SHOW` | native menu only | Opens privileged auxiliary window | internal event; no renderer producer | retain internal or replace direct call |
| `WRAPPER.UPDATE` | none found | Installs a downloaded update | dormant listener; no renderer producer | remove or constrain under PKG-002 |

When a migration changes a row, update this file in the same PR. Search evidence must include all production `ipcMain.on`, `ipcMain.once`, and `ipcMain.handle` registrations plus contract binders so wrapper helpers cannot hide an endpoint.
