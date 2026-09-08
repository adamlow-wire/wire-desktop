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

import {BrowserWindow} from 'electron';

import * as assert from 'assert';
import {createServer, Server} from 'http';
import {AddressInfo} from 'net';

import {bindNavigationGuard} from './NavigationGuard';
import {isAllowedAccountNavigation} from './NavigationPolicy';

describe('navigation guard [security-target][INV-005][SEC-008]', () => {
  let server: Server;
  let hostileServer: Server;
  let window: BrowserWindow;
  let origin: string;
  let hostileOrigin: string;
  let hostileRequests: number;

  beforeEach(async () => {
    hostileRequests = 0;
    hostileServer = createServer((_request, response) => {
      hostileRequests++;
      response.end('hostile');
    });
    await new Promise<void>(resolve => hostileServer.listen(0, '127.0.0.1', resolve));
    hostileOrigin = `http://127.0.0.1:${(hostileServer.address() as AddressInfo).port}`;
    server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, {Location: `${hostileOrigin}/escape`});
      } else {
        response.setHeader('Content-Type', 'text/html');
      }
      response.end('<!doctype html><title>Account navigation fixture</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    window = new BrowserWindow({
      show: false,
      webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false},
    });
    bindNavigationGuard(window.webContents, url => isAllowedAccountNavigation(url, origin));
    await window.loadURL(origin);
  });

  afterEach(async () => {
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await Promise.all(
      [server, hostileServer].map(server => new Promise<void>(resolve => server.close(() => resolve()))),
    );
  });

  it('allows same-origin navigation and blocks a cross-origin destination before any request reaches it', async () => {
    const loaded = new Promise<void>(resolve => window.webContents.once('did-finish-load', () => resolve()));
    await window.webContents.executeJavaScript("location.href = '/allowed'; undefined");
    await loaded;
    assert.strictEqual(window.webContents.getURL(), `${origin}/allowed`);
    const attempted = new Promise<boolean>(resolve =>
      window.webContents.once('will-navigate', event => resolve(event.defaultPrevented)),
    );
    await window.webContents.executeJavaScript(`location.href = ${JSON.stringify(hostileOrigin)}; undefined`);
    assert.strictEqual(await attempted, true);
    assert.strictEqual(window.webContents.getURL(), `${origin}/allowed`);
    assert.strictEqual(hostileRequests, 0);
  });

  it('blocks a same-origin server redirect to an unauthorized origin', async () => {
    const redirected = new Promise<boolean>(resolve =>
      window.webContents.once('will-redirect', event => resolve(event.defaultPrevented)),
    );
    await window.webContents.executeJavaScript("location.href = '/redirect'; undefined");
    assert.strictEqual(await redirected, true);
    assert.strictEqual(new URL(window.webContents.getURL()).origin, origin);
    assert.strictEqual(hostileRequests, 0);
  });
});
