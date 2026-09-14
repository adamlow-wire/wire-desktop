/*
 * Wire
 * Copyright (C) 2026 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

// Test-only main-process require hook. Never imported by production code.
const {app, dialog} = require('electron');

// Playwright forces Chromium's basic store. Let authenticated Linux tests use the host keyring.
if (process.platform === 'linux') {
  app.commandLine.removeSwitch('password-store');
}

const mediaConsent = process.env.WIRE_E2E_MEDIA_CONSENT;
if (
  !['allow', 'deny'].includes(mediaConsent) ||
  !app.commandLine.hasSwitch('use-fake-device-for-media-stream') ||
  app.commandLine.hasSwitch('use-fake-ui-for-media-stream')
) {
  throw new Error('E2E consent requires an explicit decision and synthetic devices without fake permission UI.');
}

const fixture = {installedBeforeReady: !app.isReady(), requests: []};
globalThis.wireE2EConsent = fixture;
const showMessageBox = dialog.showMessageBox.bind(dialog);
dialog.showMessageBox = (...args) => {
  const options = args.length === 2 ? args[1] : args[0];
  if (options?.message !== 'Allow account permissions?') {
    return showMessageBox(...args);
  }
  const scopes = options.detail?.split('\n\n')[1]?.split('\n') ?? [];
  const known = scopes.length > 0 && scopes.every(scope => ['Notifications', 'Microphone', 'Camera'].includes(scope));
  const approved = known && (mediaConsent === 'allow' || scopes.every(scope => scope === 'Notifications'));
  const response = args.length === 2 && !options.signal?.aborted && approved ? 1 : 0;
  fixture.requests.push({detail: options.detail, defaultId: options.defaultId, cancelId: options.cancelId, response});
  return Promise.resolve({response, checkboxChecked: false});
};
