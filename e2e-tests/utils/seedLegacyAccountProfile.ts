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

import {_electron} from '@playwright/test';

import path from 'node:path';

export const seedLegacyAccountProfile = async (profile: string, accounts: readonly unknown[]): Promise<void> => {
  const app = await _electron.launch({
    chromiumSandbox: true,
    args: [path.resolve(__dirname, '../../electron/test/fixtures/legacy-account-profile.js'), profile],
  });
  try {
    const shell = await app.firstWindow();
    await shell.waitForLoadState();
    await shell.evaluate(accounts => {
      localStorage.setItem(
        'state',
        JSON.stringify({
          accounts,
          contextMenuState: {accountId: '', isAtLeastAdmin: false, position: {centerX: 0, centerY: 0}},
        }),
      );
    }, accounts);
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].webContents.session.flushStorageData());
  } finally {
    await app.close();
  }
};
