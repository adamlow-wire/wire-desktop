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

import {app, BrowserWindow, ipcMain, session, WebPreferences} from 'electron';
import {replace, restore, spy} from 'sinon';

import * as assert from 'assert';
import {createServer} from 'http';
import {AddressInfo} from 'net';
import * as path from 'path';
import {pathToFileURL} from 'url';

import {WindowManager} from './WindowManager';

import {getPictureInPictureCallWindowOptions} from '../calling/PictureInPictureCall';
import {EVENT_TYPE} from '../lib/eventType';
import {ABOUT_LOCALE_READ_CAPABILITY} from '../security/AboutWindowContract';
import {PROXY_PROMPT_LOCALE_READ_CHANNEL, PROXY_PROMPT_SUBMIT_CAPABILITY} from '../security/ProxyPromptContract';
import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';
import {config} from '../settings/config';
import {SingleSignOn} from '../sso/SingleSignOn';

const mutableApp = app as typeof app & {setAppPath(appPath: string): void};

const getLastWebPreferences = (window: BrowserWindow): WebPreferences => {
  const webContents = window.webContents as Electron.WebContents & {getLastWebPreferences(): WebPreferences};
  return webContents.getLastWebPreferences();
};

const assertSandboxed = (window: BrowserWindow): void => {
  const preferences = getLastWebPreferences(window);
  assert.strictEqual(preferences.sandbox, true);
  assert.strictEqual(preferences.contextIsolation, true);
  assert.strictEqual(preferences.nodeIntegration, false);
  assert.strictEqual(preferences.nodeIntegrationInSubFrames, false);
};

describe('auxiliary window identity', () => {
  const windows: BrowserWindow[] = [];
  const originalAppPath = app.getAppPath();
  let acceptWebappVersions: typeof import('./AboutWindow').acceptWebappVersions;
  let AboutWindow: typeof import('./AboutWindow').AboutWindow;
  let requestActiveWebappVersions: typeof import('./AboutWindow').requestActiveWebappVersions;
  let ProxyPromptWindow: typeof import('./ProxyPromptWindow').ProxyPromptWindow;

  before(async () => {
    await app.whenReady();
    mutableApp.setAppPath(process.cwd());
    ({AboutWindow, acceptWebappVersions, requestActiveWebappVersions} = await import('./AboutWindow'));
    ({ProxyPromptWindow} = await import('./ProxyPromptWindow'));
  });

  after(() => {
    mutableApp.setAppPath(originalAppPath);
  });

  afterEach(() => {
    ipcMain.removeHandler(PROXY_PROMPT_LOCALE_READ_CHANNEL);
    while (windows.length > 0) {
      const window = windows.pop();
      if (window && !window.isDestroyed()) {
        window.destroy();
      }
    }
  });

  it('[regression][CAP-001] requests About versions through the native account binding, not the shell', async () => {
    const window = new BrowserWindow({show: false, webPreferences: {sandbox: true}});
    windows.push(window);
    replace(WindowManager, 'getPrimaryWindow', () => window);
    const shell = spy(window.webContents, 'send');
    const dispose = WindowManager.bindNativeActions(window.id, (channel, args) => {
      assert.strictEqual(channel, EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION);
      assert.deepStrictEqual(args, []);
      acceptWebappVersions({webappVersion: 'native-account-version'});
    });
    try {
      assert.deepStrictEqual(await requestActiveWebappVersions(20), {
        webappVersion: 'native-account-version',
        webappAVSVersion: undefined,
      });
      assert.strictEqual(shell.callCount, 0);
    } finally {
      dispose();
      restore();
      acceptWebappVersions({webappVersion: ''});
    }
  });

  for (const kind of ['about', 'proxy-prompt'] as const) {
    it(`[security-target][SEC-008] explicitly cancels unknown ${kind} requests and serves its own stylesheet`, async function () {
      this.timeout(10_000);
      ipcMain.handle(PROXY_PROMPT_LOCALE_READ_CHANNEL, () => ({}));
      const window = await (kind === 'about' ? AboutWindow : ProxyPromptWindow).showWindow(new ViewIdentityRegistry());
      windows.push(window);
      for (const event of ['will-navigate', 'will-redirect']) {
        let prevented = false;
        window.webContents.emit(
          event,
          {
            preventDefault: () => {
              prevented = true;
            },
          },
          'https://unapproved.test',
        );
        assert.strictEqual(prevented, true, `${kind}: ${event}`);
      }
      if (kind === 'proxy-prompt') {
        const windowCount = BrowserWindow.getAllWindows().length;
        assert.strictEqual(await window.webContents.executeJavaScript("window.open('about:blank') === null"), true);
        assert.strictEqual(BrowserWindow.getAllWindows().length, windowCount);
      }
      const stylesheet = pathToFileURL(path.join(app.getAppPath(), config.electronDirectory, `css/${kind}.css`)).href;
      const response = await window.webContents.session.fetch(stylesheet);
      assert.ok((await response.text()).includes('{'), 'expected the actual stylesheet, not an HTML redirect');
      assert.ok(response.headers.get('content-type')?.includes('text/css'));
      let requests = 0;
      const server = createServer((_request, response) => {
        requests++;
        response.end('unauthorized');
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      try {
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/unexpected`;
        await assert.rejects(
          window.webContents.session.fetch(url, {signal: AbortSignal.timeout(500)}),
          /ERR_BLOCKED_BY_CLIENT/,
        );
        assert.strictEqual(requests, 0);
      } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }

  it('[security-target][INV-001][SEC-006] creates SSO and PiP windows with sandboxed effective preferences', () => {
    const parent = new BrowserWindow({show: false});
    windows.push(parent);
    for (const options of [
      SingleSignOn.getSingleSignOnLoginWindowOptions(parent, 'https://login.example.test'),
      getPictureInPictureCallWindowOptions(),
    ]) {
      assert.strictEqual(options.webPreferences?.nodeIntegrationInWorker, false);
      const window = new BrowserWindow({...options, show: false});
      windows.push(window);
      assertSandboxed(window);
    }
  });

  it('[characterization][SEC-003] returns the latest webapp version and clears an absent AVS version', async () => {
    const primaryWindow = new BrowserWindow({show: false});
    windows.push(primaryWindow);
    WindowManager.setPrimaryWindowId(primaryWindow.id);

    const firstRequest = requestActiveWebappVersions();
    acceptWebappVersions({webappVersion: 'webapp-1', webappAVSVersion: 'avs-1'});
    assert.deepStrictEqual(await firstRequest, {webappVersion: 'webapp-1', webappAVSVersion: 'avs-1'});

    const secondRequest = requestActiveWebappVersions();
    acceptWebappVersions({webappVersion: 'webapp-2'});
    assert.deepStrictEqual(await secondRequest, {webappVersion: 'webapp-2', webappAVSVersion: undefined});

    assert.deepStrictEqual(await requestActiveWebappVersions(1), {
      webappVersion: 'webapp-2',
      webappAVSVersion: undefined,
    });
  });

  it('[characterization][security-target][INV-003][INV-004][SEC-002] creates About in its exact local session', async function () {
    this.timeout(10_000);
    const registry = new ViewIdentityRegistry();
    const window = await AboutWindow.showWindow(registry);
    windows.push(window);

    const expectedUrl = pathToFileURL(path.join(app.getAppPath(), config.electronDirectory, 'html/about.html')).href;
    assert.strictEqual(window.webContents.getURL(), expectedUrl);
    assert.strictEqual(window.webContents.session, session.fromPartition('about-window'));
    assertSandboxed(window);
    assert.strictEqual(getLastWebPreferences(window).contextIsolation, true);
    assert.strictEqual(getLastWebPreferences(window).nodeIntegration, false);
    const identity = registry.authorize(
      {sender: window.webContents, senderFrame: window.webContents.mainFrame},
      ABOUT_LOCALE_READ_CAPABILITY,
    );
    assert.strictEqual(identity.viewType, 'about');
    assert.strictEqual(identity.allowedUrl, expectedUrl);
    assert.throws(() =>
      registry.authorize(
        {sender: window.webContents, senderFrame: window.webContents.mainFrame},
        PROXY_PROMPT_SUBMIT_CAPABILITY,
      ),
    );
    await assert.rejects(AboutWindow.showWindow(new ViewIdentityRegistry()), /different view identity registry/);
    const webContentsId = window.webContents.id;
    const destroyed = new Promise<void>(resolve => window.webContents.once('destroyed', resolve));
    window.destroy();
    await destroyed;
    assert.strictEqual(registry.has(webContentsId), false);
  });

  it('[characterization][security-target][INV-003][INV-004][SEC-002] creates the proxy prompt in its exact local session', async () => {
    const registry = new ViewIdentityRegistry();
    ipcMain.handle(PROXY_PROMPT_LOCALE_READ_CHANNEL, (_event, request: {labels: string[]}) =>
      Object.fromEntries(request.labels.map(label => [label, label])),
    );
    let createdWebContentsId: number | undefined;
    let closeNotifications = 0;
    const window = await ProxyPromptWindow.showWindow(registry, webContentsId => {
      createdWebContentsId = webContentsId;
      return () => void (closeNotifications += 1);
    });
    windows.push(window);

    const expectedUrl = pathToFileURL(
      path.join(app.getAppPath(), config.electronDirectory, 'html/proxy-prompt.html'),
    ).href;
    assert.strictEqual(window.webContents.getURL(), expectedUrl);
    assert.strictEqual(window.webContents.session, session.fromPartition('proxy-prompt-window'));
    assertSandboxed(window);
    assert.strictEqual(getLastWebPreferences(window).contextIsolation, true);
    assert.strictEqual(getLastWebPreferences(window).nodeIntegration, false);
    const identity = registry.authorize(
      {sender: window.webContents, senderFrame: window.webContents.mainFrame},
      PROXY_PROMPT_SUBMIT_CAPABILITY,
    );
    assert.strictEqual(identity.viewType, 'proxy-prompt');
    assert.strictEqual(identity.allowedUrl, expectedUrl);
    assert.strictEqual(createdWebContentsId, window.webContents.id);
    assert.throws(() =>
      registry.authorize(
        {sender: window.webContents, senderFrame: window.webContents.mainFrame},
        ABOUT_LOCALE_READ_CAPABILITY,
      ),
    );
    const webContentsId = window.webContents.id;
    const destroyed = new Promise<void>(resolve => window.webContents.once('destroyed', resolve));
    window.destroy();
    await destroyed;
    assert.strictEqual(closeNotifications, 1);
    assert.strictEqual(registry.has(webContentsId), false);
  });
});
