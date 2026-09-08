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

import {BrowserWindow, HandlerDetails, session} from 'electron';
import {Maybe} from 'true-myth';

import * as assert from 'assert';
import {createServer, Server} from 'http';
import {AddressInfo} from 'net';

import {handleAccountWindowOpen} from './AccountWindowPolicy';
import {ViewIdentityRegistry} from './ViewIdentityRegistry';

import {SingleSignOn} from '../sso/SingleSignOn';

const getPreferences = (window: BrowserWindow): Electron.WebPreferences =>
  (
    window.webContents as Electron.WebContents & {getLastWebPreferences(): Electron.WebPreferences}
  ).getLastWebPreferences();

describe('account popup boundary [security-target][INV-005][SEC-008]', () => {
  let parent: BrowserWindow;
  let server: Server;
  let origin: string;
  let createdSso: SingleSignOn | undefined;
  const external: string[] = [];
  beforeEach(async () => {
    external.length = 0;
    createdSso = undefined;
    server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Popup fixture</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    parent = new BrowserWindow({
      show: false,
      webPreferences: {
        partition: 'navigation-popup-fixture',
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    parent.webContents.setWindowOpenHandler(details =>
      handleAccountWindowOpen(details, {
        accountOrigin: origin,
        sourceUrl: parent.webContents.getURL(),
        accountSession: parent.webContents.session,
        openExternal: url => {
          external.push(url);
        },
        openSso: url => {
          createdSso = SingleSignOn.create(
            parent,
            parent.webContents,
            Maybe.nothing<string>(),
            url,
            new ViewIdentityRegistry(),
          );
        },
      }),
    );
    await parent.loadURL(origin);
  });
  afterEach(async () => {
    const accountSession = session.fromPartition('navigation-popup-fixture');
    for (const window of BrowserWindow.getAllWindows()) {
      if (window === parent || window.getParentWindow() === parent || window.webContents.session === accountSession) {
        if (!window.isDestroyed()) {
          window.destroy();
        }
      }
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('opens ordinary noreferrer chat links outside Electron', async () => {
    await parent.webContents.executeJavaScript(`
      const link = document.createElement('a');
      link.href = 'https://example.test/message';
      link.target = '_blank';
      link.rel = 'nofollow noopener noreferrer';
      document.body.append(link);
      link.click();
      undefined;
    `);
    assert.deepStrictEqual(external, ['https://example.test/message']);
    assert.strictEqual(BrowserWindow.getAllWindows().filter(window => window.getParentWindow() === parent).length, 0);
  });

  it('preserves empty-URL PiP opening and the exact account session with fixed secure preferences', async () => {
    const created = new Promise<BrowserWindow>(resolve =>
      parent.webContents.once('did-create-window', child => resolve(child)),
    );
    await parent.webContents.executeJavaScript(
      "window.open('', 'WIRE_PICTURE_IN_PICTURE_CALL', 'nodeIntegration=yes,contextIsolation=no,sandbox=no'); undefined",
    );
    const child = await created;
    try {
      assert.strictEqual(
        child.webContents.session === parent.webContents.session,
        true,
        'PiP must retain the exact account session',
      );
      const preferences = getPreferences(child);
      assert.strictEqual(preferences?.sandbox, true);
      assert.strictEqual(preferences?.contextIsolation, true);
      assert.strictEqual(preferences?.nodeIntegration, false);
      assert.strictEqual(preferences?.webviewTag, false);
      assert.strictEqual(await child.webContents.executeJavaScript('typeof require'), 'undefined');
    } finally {
      child.destroy();
    }
  });

  it('creates an SSO popup in the isolated SSO session instead of the account session', async () => {
    const result = await parent.webContents.executeJavaScript(
      `window.open(${JSON.stringify(`${origin}/sso`)}, 'WIRE_SSO') === null`,
    );
    assert.strictEqual(result, true, 'the renderer must not receive a cross-session Window proxy');
    const child = createdSso?.['ssoWindow'];
    assert.ok(child);
    try {
      assert.strictEqual(
        child.webContents.session === session.fromPartition('sso'),
        true,
        'SSO must use its isolated session',
      );
      assert.strictEqual(child.webContents.session === parent.webContents.session, false);
      const preferences = getPreferences(child);
      assert.strictEqual(preferences?.sandbox, true);
      assert.strictEqual(preferences?.contextIsolation, true);
      assert.strictEqual(preferences?.nodeIntegration, false);
      const closed = new Promise<void>(resolve => child.once('closed', () => resolve()));
      parent.webContents.emit('did-start-navigation', {}, origin, false, true);
      await closed;
      assert.strictEqual(child.isDestroyed(), true, 'SSO must close when its initiating page reloads');
    } finally {
      if (!child.isDestroyed()) {
        child.destroy();
      }
    }
  });

  it('denies malformed and foreign-referrer popups without external side effects and fixes the SSO session', () => {
    const ssoUrls: string[] = [];
    const decide = (url: string, frameName: string, referrer = origin) =>
      handleAccountWindowOpen(
        {
          url,
          frameName,
          referrer: {url: referrer, policy: 'default'},
          features: 'nodeIntegration=yes',
          disposition: 'new-window',
        } as HandlerDetails,
        {
          accountOrigin: origin,
          sourceUrl: parent.webContents.getURL(),
          accountSession: parent.webContents.session,
          openExternal: url => {
            external.push(url);
          },
          openSso: url => {
            ssoUrls.push(url);
          },
        },
      );
    assert.deepStrictEqual(decide('file:///tmp/secret', '_blank'), {action: 'deny'});
    assert.deepStrictEqual(decide('https://idp.test', 'WIRE_SSO', 'https://foreign.test'), {action: 'deny'});
    assert.deepStrictEqual(external, []);
    assert.deepStrictEqual(ssoUrls, []);
    assert.deepStrictEqual(decide('https://example.test/', '_blank'), {action: 'deny'});
    assert.deepStrictEqual(external, ['https://example.test/']);
    const sso = decide('https://idp.test', 'WIRE_SSO');
    assert.deepStrictEqual(sso, {action: 'deny'});
    assert.deepStrictEqual(ssoUrls, ['https://idp.test']);
  });
});
