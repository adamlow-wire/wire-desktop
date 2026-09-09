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

import {app, BrowserWindow, session, webContents} from 'electron';

import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import path from 'path';

import {readLegacyAccountState} from './readLegacyAccountState';

const shellFile = path.resolve(__dirname, '../../renderer/index.html');

const seedLegacyState = async (accountSession: Electron.Session, state: string) => {
  const writer = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
      session: accountSession,
    },
  });
  const destroyed = new Promise<void>(resolve => writer.webContents.once('destroyed', () => resolve()));
  try {
    await writer.loadFile(shellFile);
    const debuggerApi = writer.webContents.debugger;
    debuggerApi.attach('1.3');
    const {frameTree} = await debuggerApi.sendCommand('Page.getFrameTree');
    const {storageKey} = await debuggerApi.sendCommand('Storage.getStorageKey', {frameId: frameTree.frame.id});
    await debuggerApi.sendCommand('DOMStorage.setDOMStorageItem', {
      storageId: {storageKey, isLocalStorage: true},
      key: 'state',
      value: state,
    });
    debuggerApi.detach();
  } finally {
    writer.destroy();
    await destroyed;
  }
};

describe('legacy account profile reader', () => {
  it('[security-target][CAP-001] disables application scripts, Node and webviews in the migration window', async () => {
    let preferences: Electron.WebPreferences | undefined;
    app.once('browser-window-created', (_event, window) => {
      preferences = (
        window.webContents as Electron.WebContents & {getLastWebPreferences(): Electron.WebPreferences}
      ).getLastWebPreferences();
    });
    await readLegacyAccountState(shellFile, session.fromPartition(`legacy-profile-${randomUUID()}`));
    assert.equal(preferences?.javascript, false);
    assert.equal(preferences?.contextIsolation, true);
    assert.equal(preferences?.nodeIntegration, false);
    assert.equal(preferences?.sandbox, true);
    assert.equal(preferences?.webviewTag, false);
  });

  it('[CAP-001] reads exact legacy state without clearing cookies or leaving migration windows', async () => {
    const accountSession = session.fromPartition(`legacy-profile-${randomUUID()}`);
    const state = JSON.stringify({accounts: [{id: '11111111-1111-4111-8111-111111111111'}]});
    await seedLegacyState(accountSession, state);
    await accountSession.cookies.set({url: 'https://example.com', name: 'marker', value: 'retained'});
    const before = webContents.getAllWebContents().map(contents => contents.id);
    assert.equal(await readLegacyAccountState(shellFile, accountSession), state);
    assert.equal(
      await readLegacyAccountState(shellFile, session.fromPartition(`other-profile-${randomUUID()}`)),
      undefined,
    );
    assert.deepEqual(
      webContents.getAllWebContents().map(contents => contents.id),
      before,
    );
    assert.equal((await accountSession.cookies.get({name: 'marker'}))[0].value, 'retained');
  });

  it('[security-target][CAP-001] refuses oversized legacy state and still destroys the reader', async () => {
    const accountSession = session.fromPartition(`legacy-profile-${randomUUID()}`);
    await seedLegacyState(accountSession, ' '.repeat(2 * 1024 * 1024 + 1));
    const before = webContents.getAllWebContents().map(contents => contents.id);
    await assert.rejects(readLegacyAccountState(shellFile, accountSession), /size limit/);
    assert.deepEqual(
      webContents.getAllWebContents().map(contents => contents.id),
      before,
    );
  });

  it('[CAP-001] distinguishes a fresh profile from a failed legacy read', async () => {
    const accountSession = session.fromPartition(`legacy-profile-${randomUUID()}`);
    assert.equal(await readLegacyAccountState(shellFile, accountSession), undefined);
    const before = webContents.getAllWebContents().map(contents => contents.id);
    await assert.rejects(readLegacyAccountState(`${shellFile}.missing`, accountSession));
    assert.deepEqual(
      webContents.getAllWebContents().map(contents => contents.id),
      before,
    );
  });
});
