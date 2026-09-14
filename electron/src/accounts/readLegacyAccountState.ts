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

import {BrowserWindow, Session} from 'electron';

import {bindNavigationGuard} from '../security/NavigationGuard';

// This temporary window reads the old file origin without executing application code.
export const readLegacyAccountState = async (
  shellFile: string,
  accountSession: Session,
): Promise<string | undefined> => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
      session: accountSession,
      webviewTag: false,
    },
  });
  const contents = window.webContents;
  const destroyed = new Promise<void>(resolve => contents.once('destroyed', () => resolve()));
  contents.setWindowOpenHandler(() => ({action: 'deny'}));
  bindNavigationGuard(contents, () => false);
  try {
    await window.loadFile(shellFile);
    contents.debugger.attach('1.3');
    const {frameTree} = await contents.debugger.sendCommand('Page.getFrameTree');
    const {storageKey} = await contents.debugger.sendCommand('Storage.getStorageKey', {frameId: frameTree.frame.id});
    const {entries} = await contents.debugger.sendCommand('DOMStorage.getDOMStorageItems', {
      storageId: {storageKey, isLocalStorage: true},
    });
    const value = (entries as string[][]).find(([key]) => key === 'state')?.[1];
    if (value && Buffer.byteLength(value, 'utf8') > 2 * 1024 * 1024) {
      throw new Error('Legacy account profile exceeds size limit.');
    }
    return value;
  } finally {
    if (!contents.isDestroyed() && contents.debugger.isAttached()) {
      contents.debugger.detach();
    }
    if (!window.isDestroyed()) {
      window.destroy();
    }
    await destroyed;
  }
};
