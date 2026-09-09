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

import {BrowserWindow, net, session, Session} from 'electron';
import {restore, spy, stub} from 'sinon';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {createServer, Server} from 'node:http';
import {AddressInfo} from 'node:net';

import {clearAccountSession} from './AccountSessionCleanup';

describe('native account session cleanup', () => {
  let server: Server;
  let origin: string;
  let target: Session;
  let retained: Session;
  let windows: BrowserWindow[];
  const authorization = `Basic ${Buffer.from('fixture-user:fixture-password').toString('base64')}`;
  const request = (targetSession: Session): Promise<number> =>
    new Promise((resolve, reject) => {
      let challenges = 0;
      const outgoing = net.request({url: `${origin}/protected`, session: targetSession});
      outgoing.on('login', (_info, callback) => {
        challenges++;
        callback('fixture-user', 'fixture-password');
      });
      outgoing.on('error', reject);
      outgoing.on('response', response => {
        response.on('error', reject);
        response.on('data', () => undefined);
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`Fixture authentication failed: ${response.statusCode}`));
          } else {
            resolve(challenges);
          }
        });
      });
      outgoing.end();
    });

  beforeEach(async () => {
    windows = [];
    target = session.fromPartition(`cleanup-target-${randomUUID()}`);
    retained = session.fromPartition(`cleanup-retained-${randomUUID()}`);
    server = createServer((incoming, response) => {
      response.setHeader('Cache-Control', 'no-store');
      if (incoming.url === '/protected' && incoming.headers.authorization !== authorization) {
        response.writeHead(401, {'WWW-Authenticate': 'Basic realm="account-cleanup-fixture"'});
      }
      response.end('fixture');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    restore();
    for (const window of windows) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
    for (const owned of [target, retained]) {
      await owned.clearAuthCache();
      await owned.clearStorageData();
      await owned.closeAllConnections();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('[characterization][INV-004][CAP-001] clears only the selected session cookies and permits retry', async () => {
    await target.cookies.set({url: origin, name: 'account', value: 'target'});
    await retained.cookies.set({url: origin, name: 'account', value: 'retained'});
    await clearAccountSession(target);
    await clearAccountSession(target);
    assert.deepEqual(await target.cookies.get({url: origin}), []);
    assert.deepEqual(
      (await retained.cookies.get({url: origin})).map(cookie => cookie.value),
      ['retained'],
    );
  });

  it('[security-target][INV-004][CAP-001] forgets target HTTP credentials without clearing another session', async () => {
    assert.equal(await request(target), 1);
    assert.equal(await request(retained), 1);
    assert.equal(await request(target), 0);
    assert.equal(await request(retained), 0);
    await clearAccountSession(target);
    assert.equal(await request(target), 1, 'removed account must authenticate again');
    assert.equal(await request(retained), 0, 'retained account must keep its authentication cache');
  });

  it('[security-target][INV-004][CAP-001] clears local storage, IndexedDB and Cache Storage only in the target', async () => {
    const open = async (owned: Session) => {
      const window = new BrowserWindow({
        show: false,
        webPreferences: {session: owned, sandbox: true, contextIsolation: true, nodeIntegration: false},
      });
      windows.push(window);
      await window.loadURL(`${origin}/storage`);
      return window;
    };
    const seed = `
      (async () => {
        localStorage.setItem('account', 'fixture');
        await (await caches.open('account')).put('/cached', new Response('fixture'));
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('account', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('messages');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => { request.result.close(); resolve(); };
        });
      })()
    `;
    const read = `
      (async () => ({
        local: localStorage.getItem('account'),
        caches: await caches.keys(),
        databases: (await indexedDB.databases()).map(database => database.name),
      }))()
    `;
    const stored = {local: 'fixture', caches: ['account'], databases: ['account']};
    for (const owned of [target, retained]) {
      const window = await open(owned);
      await window.webContents.executeJavaScript(seed);
      assert.deepEqual(await window.webContents.executeJavaScript(read), stored);
      const destroyed = new Promise<void>(resolve => window.webContents.once('destroyed', () => resolve()));
      window.destroy();
      await destroyed;
    }
    await clearAccountSession(target);
    assert.deepEqual(await (await open(target)).webContents.executeJavaScript(read), {
      local: null,
      caches: [],
      databases: [],
    });
    assert.deepEqual(await (await open(retained)).webContents.executeJavaScript(read), stored);
  });

  for (const method of ['clearData', 'clearAuthCache', 'closeAllConnections'] as const) {
    it(`[security-target][INV-010][CAP-001] propagates ${method} failure without touching another session`, async () => {
      const otherCalls = [
        spy(retained, 'clearData'),
        spy(retained, 'clearAuthCache'),
        spy(retained, 'closeAllConnections'),
      ];
      const failure = stub(target, method).rejects(new Error('fixture cleanup failure'));
      await assert.rejects(clearAccountSession(target), /fixture cleanup failure/);
      otherCalls.forEach(call => assert.equal(call.callCount, 0));
      failure.restore();
      await clearAccountSession(target);
    });
  }
});
