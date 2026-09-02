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

import {app, BrowserWindow, session, WebPreferences} from 'electron';

import * as assert from 'assert';
import * as path from 'path';
import {pathToFileURL} from 'url';

import {config} from '../settings/config';

const getLastWebPreferences = (window: BrowserWindow): WebPreferences => {
  const webContents = window.webContents as Electron.WebContents & {getLastWebPreferences(): WebPreferences};
  return webContents.getLastWebPreferences();
};

describe('auxiliary window identity', () => {
  const windows: BrowserWindow[] = [];
  const originalAppPath = app.getAppPath();
  let AboutWindow: typeof import('./AboutWindow').AboutWindow;
  let ProxyPromptWindow: typeof import('./ProxyPromptWindow').ProxyPromptWindow;

  before(async () => {
    await app.whenReady();
    app.setAppPath(process.cwd());
    ({AboutWindow} = await import('./AboutWindow'));
    ({ProxyPromptWindow} = await import('./ProxyPromptWindow'));
  });

  after(() => {
    app.setAppPath(originalAppPath);
  });

  afterEach(() => {
    while (windows.length > 0) {
      const window = windows.pop();
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
    }
  });

  it('[characterization][SEC-002] creates About in its exact local session', async () => {
    const window = await AboutWindow.showWindow();
    windows.push(window);

    const expectedUrl = pathToFileURL(path.join(app.getAppPath(), config.electronDirectory, 'html/about.html')).href;
    assert.strictEqual(window.webContents.getURL(), expectedUrl);
    assert.strictEqual(window.webContents.session, session.fromPartition('about-window'));
    assert.strictEqual(getLastWebPreferences(window).nodeIntegration, false);
  });

  it('[characterization][SEC-002] creates the proxy prompt in its exact local session', async () => {
    const window = await ProxyPromptWindow.showWindow();
    windows.push(window);

    const expectedUrl = pathToFileURL(
      path.join(app.getAppPath(), config.electronDirectory, 'html/proxy-prompt.html'),
    ).href;
    assert.strictEqual(window.webContents.getURL(), expectedUrl);
    assert.strictEqual(window.webContents.session, session.fromPartition('proxy-prompt-window'));
    assert.strictEqual(getLastWebPreferences(window).nodeIntegration, false);
  });
});
