# Isolated Windows M4 preview

This unsigned development preview is for manual functional testing. It is not a release-qualified installer. The full ZIP is required: the executable depends on its adjacent DLLs and resources.

1. Extract the ZIP into a new writable folder, outside your existing Wire installation.
2. Double-click `Start-Wire-M4.cmd`. It launches `WireM4Preview.exe` with a separate `Data` profile beside the executable.
3. Sign in explicitly. Existing Wire sessions and local data are not imported. Close the preview before moving or removing its folder.

The preview has a distinct application identity and `wire-m4-preview` protocol registration. It does not replace the installed application's `wire` protocol registration. No installer or updater is included. Launching the executable directly also uses its distinct default profile, but use the supplied launcher for a predictable removable profile. Keep the installation folder and its parent free of `Update.exe`.

Profile separation is not account/server isolation: messages, account changes and new-device registration still affect the account you sign into. Prefer a test account. Browser SSO and ordinary `wire://` links are not suitable acceptance tests for this preview because they target the installed application's protocol. Live enterprise SSO/E2EI remains the separate QA handoff. Do not disable Windows security controls if organizational policy blocks this unsigned build.

## Useful manual checks now

- Sign in, switch between accounts, restart, then remove a test account and confirm the others remain intact.
- Exercise menus, keyboard shortcuts, unread badges and notification activation.
- Make an audio/video call with a second device or test participant.
- Share a harmless test window: verify the compact horizontal picker, explicit source selection, received pixels, Cancel before selection, automatic picker dismissal and Stop in the call UI. Repeat from a detached call window.
- Switch accounts or minimize while sharing; restore the call and verify its Stop control ends delivery without a separate sharing dialog. Close/navigate the parent account and verify its detached call closes.

Use the display QA checklist for detailed capture/privacy/monitor checks. Record Windows version, `BUILD.txt` commit, steps, expected/actual behavior, and screenshots without sensitive conversations. The preview preserves Electron 43.4.0, sandboxing, permission checks and existing certificate-pinning policy. Its existence does not mark outstanding CI or M4 acceptance gates complete.
