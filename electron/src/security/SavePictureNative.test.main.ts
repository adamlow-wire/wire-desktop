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

import {app, BrowserWindow, dialog, ipcMain} from 'electron';
import {stub, restore} from 'sinon';
import {Maybe} from 'true-myth';

import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {mkdtemp, readFile, readdir, rm} from 'fs/promises';
import {createServer, Server} from 'http';
import {AddressInfo} from 'net';
import {tmpdir} from 'os';
import path from 'path';

import {bindSavePictureIpc, SAVE_PICTURE_CAPABILITY} from './SavePictureIpc';
import {registerViewIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

import {downloadImage} from '../lib/download';

describe('native picture save IPC [INV-003][INV-010][SEC-003]', function () {
  this.timeout(20_000);
  let server: Server;
  let directory: string;
  let windows: BrowserWindow[];
  let registry: ViewIdentityRegistry;
  let dispose: () => void;
  let cancelPending: () => void;

  beforeEach(async () => {
    windows = [];
    dispose = () => {};
    cancelPending = () => {};
    await app.whenReady();
    directory = await mkdtemp(path.join(tmpdir(), 'wire-native-picture-'));
    server = createServer((_request, response) => response.end('<!doctype html><title>Owned picture fixture</title>'));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    registry = new ViewIdentityRegistry();
    for (let index = 0; index < 2; index += 1) {
      const partition = `picture-test-${randomUUID()}`;
      const window = new BrowserWindow({
        show: false,
        webPreferences: {
          partition,
          preload: path.join(process.cwd(), 'electron/test/fixtures/save-picture-preload.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false,
        },
      });
      windows.push(window);
      await window.loadURL(origin);
      registerViewIdentity(registry, {
        accountId: `account-${index}`,
        allowedOrigin: origin,
        capabilities: [SAVE_PICTURE_CAPABILITY],
        partition,
        session: window.webContents.session,
        viewType: 'account',
        webContents: window.webContents,
      });
    }
    dispose = bindSavePictureIpc(ipcMain, registry, (bytes, timestamp) => downloadImage(bytes, Maybe.of(timestamp)));
  });

  afterEach(async () => {
    cancelPending();
    dispose();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
    restore();
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
    if (directory) {
      await rm(directory, {recursive: true, force: true});
    }
  });

  const request = (window: BrowserWindow, bytes: number[]): Promise<{ok: boolean; error?: string}> =>
    window.webContents.executeJavaScript(`(async () => {
      try {
        await window.savePictureFixture.save(${JSON.stringify(bytes)});
        return {ok: true};
      } catch (error) {
        return {ok: false, error: String(error)};
      }
    })()`);

  it('denies overlapping, malformed and revoked senders, then recovers after native cancellation', async () => {
    const destination = path.join(directory, 'picture.bin');
    let signalOpened: () => void;
    const opened = new Promise<void>(resolve => {
      signalOpened = resolve;
    });
    const prompt = stub(dialog, 'showSaveDialog');
    prompt.onFirstCall().callsFake(
      () =>
        new Promise(resolve => {
          cancelPending = () => resolve({canceled: true, filePath: ''});
          signalOpened();
        }),
    );
    prompt.onSecondCall().resolves({canceled: false, filePath: destination});
    const pending = request(windows[0], [1, 2, 3]);
    // Preserve the original promise for assertions while handling teardown after an early timeout.
    void pending.catch(() => {});
    let timeout: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        opened,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Native save boundary was not reached.')), 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout!);
    }
    assert.deepEqual(await readdir(directory), []);
    const overlapping = await request(windows[1], [4]);
    assert.equal(overlapping.ok, false);
    assert.match(overlapping.error!, /already pending/);
    const malformed = await request(windows[0], []);
    assert.equal(malformed.ok, false);
    assert.match(malformed.error!, /payload/);
    registry.unregister(windows[1].webContents.id);
    const revoked = await request(windows[1], [5]);
    assert.equal(revoked.ok, false);
    assert.match(revoked.error!, /not authorized/);
    assert.equal(prompt.callCount, 1);
    cancelPending();
    assert.deepEqual(await pending, {ok: true});
    assert.deepEqual(await readdir(directory), []);
    assert.deepEqual(await request(windows[0], [6, 7, 8]), {ok: true});
    assert.equal(prompt.callCount, 2);
    assert.deepEqual(await readFile(destination), Buffer.from([6, 7, 8]));
  });
});
