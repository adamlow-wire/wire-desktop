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

import {app, BrowserWindow, WebContents} from 'electron';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {createServer, Server} from 'node:http';
import {AddressInfo} from 'node:net';
import path from 'node:path';

import {AccountViews} from './AccountViews';

import {ACCOUNT_PERMISSION_CAPABILITY, AccountPermissionScope} from '../security/AccountPermissionPolicy';
import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

describe('[security-target][SEC-009] native account fake-media permissions', () => {
  let server: Server;
  let window: BrowserWindow;
  let views: AccountViews;
  let contents: WebContents;
  let consent: boolean;
  let prompts: AccountPermissionScope[][];

  before(() => {
    // Refuse to access media unless Chromium was started with synthetic devices.
    assert.equal(app.commandLine.hasSwitch('use-fake-device-for-media-stream'), true);
    assert.equal(app.commandLine.hasSwitch('use-fake-ui-for-media-stream'), false);
  });

  beforeEach(async () => {
    consent = false;
    prompts = [];
    server = createServer((_request, response) => response.end('<!doctype html><title>Fake media fixture</title>'));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    window = new BrowserWindow({show: false, webPreferences: {sandbox: true, contextIsolation: true}});
    views = new AccountViews({
      window,
      registry: new ViewIdentityRegistry(),
      preload: path.join(process.cwd(), 'electron/dist/preload/preload-secure-account.js'),
      additionalArguments: [],
      capabilities: [ACCOUNT_PERMISSION_CAPABILITY],
      permissionConsent: {
        canPrompt: () => true,
        ask: async (_identity, scopes) => {
          prompts.push([...scopes]);
          return consent;
        },
      },
      configure: async () => undefined,
      lost: () => undefined,
    });
    const account = {id: randomUUID(), sessionID: randomUUID()};
    contents = await views.create(account, origin);
    views.select(account.id);
  });

  afterEach(async () => {
    await views?.dispose();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const capture = (constraints: {audio?: boolean; video?: boolean}) =>
    contents.executeJavaScript(`(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(${JSON.stringify(constraints)});
        const tracks = stream.getTracks();
        const kinds = tracks.map(track => track.kind).sort();
        tracks.forEach(track => track.stop());
        return {kinds};
      } catch (error) {
        return {error: error.name};
      }
    })()`);

  it('denies real media requests when main-owned consent is cancelled', async () => {
    assert.deepEqual(await capture({audio: true, video: true}), {error: 'NotAllowedError'});
    assert.deepEqual(prompts, [['audio', 'video']]);
  });

  it('grants fake microphone and camera separately and revokes grants after reload', async () => {
    consent = true;
    assert.deepEqual(await capture({audio: true}), {kinds: ['audio']});
    assert.deepEqual(prompts, [['audio']]);
    assert.deepEqual(await capture({video: true}), {kinds: ['video']});
    assert.deepEqual(prompts, [['audio'], ['video']]);
    assert.deepEqual(await capture({audio: true, video: true}), {kinds: ['audio', 'video']});
    assert.equal(prompts.length, 2);
    consent = false;
    await contents.loadURL(contents.getURL());
    assert.deepEqual(await capture({audio: true}), {error: 'NotAllowedError'});
    assert.deepEqual(prompts, [['audio'], ['video'], ['audio']]);
  });
});
