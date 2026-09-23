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

  beforeEach(async function () {
    // A hosted Windows account load also exceeded ten seconds before any media
    // request. Keep this native startup bound finite; test bodies retain two seconds.
    this.timeout(20_000);
    const started = performance.now();
    let stage = 'starting the fixture server';
    let pendingAccountId: string | undefined;
    const reportPending = () => {
      let pendingContents: WebContents | undefined;
      try {
        pendingContents = pendingAccountId ? views?.get(pendingAccountId) : undefined;
      } catch {
        // Registration can still be in progress; report that phase without account data.
      }
      console.error('Native fake-media setup pending:', {
        stage,
        elapsedMs: Math.round(performance.now() - started),
        serverListening: server?.listening ?? false,
        windowDestroyed: window?.isDestroyed() ?? true,
        contentsRegistered: Boolean(pendingContents),
        contentsLoadingMainFrame: pendingContents?.isLoadingMainFrame(),
        contentsCrashed: pendingContents?.isCrashed(),
      });
    };
    const warning = setTimeout(reportPending, 1_500);
    const lateWarning = setTimeout(reportPending, 9_000);
    try {
      consent = false;
      prompts = [];
      server = createServer((_request, response) => response.end('<!doctype html><title>Fake media fixture</title>'));
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      stage = 'creating the fixture window';
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
      pendingAccountId = account.id;
      stage = 'creating and loading the account view';
      contents = await views.create(account, origin);
      views.select(account.id);
    } finally {
      clearTimeout(warning);
      clearTimeout(lateWarning);
      if (performance.now() - started >= 1_500) {
        console.error('Native fake-media setup settled:', {
          stage,
          elapsedMs: Math.round(performance.now() - started),
        });
      }
    }
  });

  afterEach(async () => {
    await views?.dispose();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const capture = async (constraints: {
    audio?: boolean;
    video?: boolean | {mandatory: {chromeMediaSource: string; chromeMediaSourceId: string}};
  }) => {
    const requestor = contents;
    const currentPrompts = prompts;
    const priorPromptCount = currentPrompts.length;
    const started = performance.now();
    const warning = setTimeout(() => {
      console.error('Native fake-media request pending:', {
        elapsedMs: Math.round(performance.now() - started),
        prompts: currentPrompts.length - priorPromptCount,
        requestorDestroyed: requestor.isDestroyed(),
        audioRequested: constraints.audio === true,
        videoRequested: Boolean(constraints.video),
        legacyCapture: typeof constraints.video === 'object',
      });
    }, 1_500);
    try {
      return await requestor.executeJavaScript(`(async () => {
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
    } finally {
      clearTimeout(warning);
    }
  };

  it('denies real media requests when main-owned consent is cancelled', async () => {
    assert.deepEqual(await capture({audio: true, video: true}), {error: 'NotAllowedError'});
    assert.deepEqual(prompts, [['audio', 'video']]);
  });

  it('does not reuse device consent for legacy capture of a test-owned fixture window', async () => {
    consent = true;
    assert.deepEqual(await capture({audio: true, video: true}), {kinds: ['audio', 'video']});
    // Never use a screen id or enumerate sources: only this fixture's own window.
    await window.webContents.loadURL('data:text/html,<title>Blank capture fixture</title>');
    const sourceId = window.getMediaSourceId();
    assert.match(sourceId, /^window:/);
    window.show();
    assert.deepEqual(
      await capture({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
          },
        },
      }),
      {error: 'NotAllowedError'},
    );
  });

  it('denies modern display capture before source selection despite device consent', async () => {
    consent = true;
    assert.deepEqual(await capture({audio: true, video: true}), {kinds: ['audio', 'video']});
    let selections = 0;
    contents.session.setDisplayMediaRequestHandler((_request, callback) => {
      selections++;
      // No source is ever supplied, including during a sensitivity perturbation.
      callback({});
    });
    try {
      const result = await contents.executeJavaScript(
        `(async () => {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({video: true});
          stream.getTracks().forEach(track => track.stop());
          return 'unexpected-stream';
        } catch (error) {
          return error.name;
        }
      })()`,
        true,
      );
      assert.deepEqual({result, selections}, {result: 'NotAllowedError', selections: 0});
    } finally {
      contents.session.setDisplayMediaRequestHandler(null);
    }
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
