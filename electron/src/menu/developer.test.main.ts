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
import {restore, stub} from 'sinon';

import {strict as assert} from 'assert';

import {createDeveloperMenu} from './developer';

import * as EnvironmentUtil from '../runtime/EnvironmentUtil';
import * as lifecycle from '../runtime/lifecycle';
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
    assert.strictEqual(preferences.sandbox, true);
    assert.strictEqual(preferences.nodeIntegrationInSubFrames, false);
  });

  it('[security-target][SEC-008] denies navigation and child windows from WebRTC internals', async () => {
    const registry = new ViewIdentityRegistry();
    const menu = createDeveloperMenu(registry);
    const item = menu.submenu?.items.find(candidate => candidate.label === 'Toggle WebRTC Internals');
    assert.ok(item);
    item.click(undefined as never, undefined as never, undefined as never);
    const window = BrowserWindow.getAllWindows().find(candidate => registry.has(candidate.webContents.id));
    assert.ok(window);
    window.hide();
    if (window.webContents.isLoading()) {
      await new Promise<void>(resolve => window.webContents.once('did-finish-load', () => resolve()));
    }
    let popups = 0;
    window.webContents.on('did-create-window', () => {
      popups++;
    });
    await window.webContents.executeJavaScript("window.open('about:blank'); undefined");
    assert.strictEqual(popups, 0);
    for (const name of ['will-navigate', 'will-redirect']) {
      let prevented = false;
      window.webContents.emit(
        name,
        {
          preventDefault: () => {
            prevented = true;
          },
        },
        'https://untrusted.test',
      );
      assert.strictEqual(prevented, true, name);
    }
  });
});

describe('[PKG-003] developer environment settings failure', () => {
  afterEach(() => restore());

  for (const saveFails of [false, true]) {
    it(`relaunches only after the environment is saved (failure=${saveFails})`, async () => {
      stub(EnvironmentUtil, 'getAvailableEnvironments').returns([
        {isActive: false, name: 'Beta', server: EnvironmentUtil.ServerType.BETA, url: 'https://example.test'},
      ]);
      const save = stub(EnvironmentUtil, 'setEnvironment');
      if (saveFails) {
        save.throws(new Error('synthetic persistence failure'));
      }
      const relaunch = stub(lifecycle, 'relaunch').resolves();
      const menu = createDeveloperMenu(new ViewIdentityRegistry());
      const item = menu.submenu?.items.find(candidate => candidate.label === 'Beta');
      assert.ok(item);
      await item.click(undefined as never, undefined as never, undefined as never);
      assert.strictEqual(save.callCount, 1);
      assert.strictEqual(save.firstCall.args[0], EnvironmentUtil.ServerType.BETA);
      assert.strictEqual(relaunch.callCount, saveFails ? 0 : 1);
    });
  }
});
