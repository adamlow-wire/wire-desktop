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

import {expect, test} from '../../fixtures';

test('[security-target][SEC-006] product shell and account run sandboxed', {tag: ['@regression']}, async ({app}) => {
  const preferences = await app.evaluate(({webContents, app: electronApp}) => ({
    globalSandbox: electronApp.commandLine.hasSwitch('enable-sandbox'),
    sandboxDisabled: electronApp.commandLine.hasSwitch('no-sandbox'),
    views: webContents
      .getAllWebContents()
      .filter(contents => ['window', 'webview'].includes(contents.getType()))
      .map(contents => ({
        type: contents.getType(),
        preferences: (
          contents as Electron.WebContents & {getLastWebPreferences(): Electron.WebPreferences}
        ).getLastWebPreferences(),
      })),
  }));
  expect(preferences.globalSandbox).toBe(true);
  expect(preferences.sandboxDisabled).toBe(false);
  expect(preferences.views.map(view => view.type)).toEqual(expect.arrayContaining(['window', 'webview']));
  for (const view of preferences.views) {
    expect(view.preferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
    });
  }
  for (const page of [app.wrapper, app.page]) {
    expect(
      await page.evaluate(() => ({
        require: typeof Reflect.get(window, 'require'),
        process: typeof Reflect.get(window, 'process'),
        electron: typeof Reflect.get(window, 'electron'),
      })),
    ).toEqual({require: 'undefined', process: 'undefined', electron: 'undefined'});
  }
});
