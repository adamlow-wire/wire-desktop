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

import {BrowserWindow, session, WebContents} from 'electron';
import {restore, spy} from 'sinon';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {createServer, Server} from 'node:http';
import {AddressInfo} from 'node:net';
import path from 'node:path';

import {AccountViews} from './AccountViews';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

describe('[characterization][SEC-009] native account permission callbacks', () => {
  let server: Server;
  let origin: string;
  let window: BrowserWindow;
  let views: AccountViews;
  let contents: WebContents;
  let requests: Array<{permission: string; sender: WebContents; isMainFrame: boolean; requestingUrl: string}>;
  let checks: Array<{permission: string; sender: WebContents | null; requestingOrigin: string}>;

  beforeEach(async () => {
    server = createServer((_request, response) => response.end('<!doctype html><title>Permission fixture</title>'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    window = new BrowserWindow({show: false, webPreferences: {sandbox: true, contextIsolation: true}});
    const account = {id: randomUUID(), sessionID: randomUUID()};
    const owned = session.fromPartition(`persist:${account.sessionID}`);
    const installed = spy(owned, 'setPermissionRequestHandler');
    const installedCheck = spy(owned, 'setPermissionCheckHandler');
    views = new AccountViews({
      window,
      registry: new ViewIdentityRegistry(),
      preload: path.join(process.cwd(), 'electron/dist/preload/preload-secure-account.js'),
      additionalArguments: [],
      capabilities: [],
      configure: async () => undefined,
      lost: () => undefined,
    });
    contents = await views.create(account, origin);
    const productionHandler = installed.lastCall.args[0]!;
    const productionCheck = installedCheck.lastCall.args[0]!;
    requests = [];
    checks = [];
    owned.setPermissionRequestHandler((sender, permission, callback, details) => {
      requests.push({permission, sender, isMainFrame: details.isMainFrame, requestingUrl: details.requestingUrl});
      productionHandler(sender, permission, callback, details);
    });
    owned.setPermissionCheckHandler((sender, permission, requestingOrigin, details) => {
      checks.push({sender, permission, requestingOrigin});
      return productionCheck(sender, permission, requestingOrigin, details);
    });
  });

  afterEach(async () => {
    restore();
    await views?.dispose();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('denies a notification request while exposing the owning main-frame identity to the request handler', async () => {
    assert.equal(await contents.executeJavaScript('Notification.requestPermission()'), 'denied');
    const request = requests.find(request => request.permission === 'notifications')!;
    assert.ok(request);
    assert.equal(request.sender, contents);
    assert.equal(request.isMainFrame, true);
    assert.equal(new URL(request.requestingUrl).origin, origin);
  });

  it('denies geolocation and identifies the requesting frame', async () => {
    const result = await contents.executeJavaScript(`new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('unexpected grant'),
        error => resolve(error.code)
      );
    })`);
    assert.equal(result, 1);
    const request = requests.find(request => request.permission === 'geolocation')!;
    assert.ok(request);
    assert.equal(request.sender, contents);
    assert.equal(request.isMainFrame, true);
    assert.equal(new URL(request.requestingUrl).origin, origin);
  });

  it('binds a direct notification permission query to the account view and origin', async () => {
    assert.equal(await contents.executeJavaScript('Notification.permission'), 'denied');
    const check = checks.find(check => check.permission === 'notifications')!;
    assert.ok(check);
    assert.equal(check.sender, contents);
    assert.equal(new URL(check.requestingOrigin).origin, origin);
  });

  it('reports the denied notification state through both browser permission interfaces', async () => {
    const states = await contents.executeJavaScript(`(async () => ({
      notification: Notification.permission,
      query: (await navigator.permissions.query({name: 'notifications'})).state,
    }))()`);
    assert.deepEqual(states, {notification: 'denied', query: 'denied'});
  });
});
