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

import {app, BrowserWindow, WebPreferences} from 'electron';

import {strict as assert} from 'assert';

import {createDeveloperMenu} from './developer';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

describe('developer menu view identity', () => {
  afterEach(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
  });

  it('[characterization][security-target][INV-003][INV-004][SEC-002] registers WebRTC internals before loading it', async () => {
    await app.whenReady();
    const registry = new ViewIdentityRegistry();
    const menu = createDeveloperMenu(registry);
    const item = menu.submenu?.items.find(candidate => candidate.label === 'Toggle WebRTC Internals');
    assert.ok(item);

    item.click(undefined as never, undefined as never, undefined as never);

    const window = BrowserWindow.getAllWindows().find(candidate => registry.has(candidate.webContents.id));
    assert.ok(window);
    const preferences = (
      window.webContents as Electron.WebContents & {getLastWebPreferences(): WebPreferences}
    ).getLastWebPreferences();
    assert.strictEqual(preferences.nodeIntegration, false);
    assert.strictEqual(preferences.contextIsolation, true);
  });
});
