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

import {strict as assert} from 'node:assert';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

import {bindNavigationGuard} from './NavigationGuard';
import {isAllowedAccountNavigation} from './NavigationPolicy';
import {registerViewIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

describe('[SEC-003][INV-003] native account frame identity', () => {
  it('[characterization] keeps the registered main frame authorized through initial and same-origin loads', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Owned account fixture</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const window = new BrowserWindow({
      show: false,
      webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true},
    });
    try {
      const contents = window.webContents;
      const registry = new ViewIdentityRegistry();
      const capability = 'test:account-frame';
      registerViewIdentity(registry, {
        accountId: '11111111-1111-4111-8111-111111111111',
        allowedOrigin: origin,
        capabilities: [capability],
        partition: 'default',
        session: contents.session,
        viewType: 'account',
        webContents: contents,
      });
      bindNavigationGuard(contents, target => isAllowedAccountNavigation(target, origin));
      for (const destination of [origin, `${origin}/again`]) {
        await contents.loadURL(destination);
        assert.equal(new URL(contents.mainFrame.url).origin, origin);
        assert.equal(
          registry.authorize({sender: contents, senderFrame: contents.mainFrame}, capability).webContents,
          contents,
        );
      }
    } finally {
      if (!window.isDestroyed()) {
        window.destroy();
      }
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
