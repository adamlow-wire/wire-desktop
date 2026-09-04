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

import {app, BrowserWindow, ipcMain} from 'electron';

import * as assert from 'assert';
import * as path from 'path';

import {createRendererRuntimeArguments} from '../runtime/rendererRuntimeArguments';
import {MANAGED_CONFIG_CHANNEL} from '../security/ManagedConfigContract';

const preloadPath = (name: 'preload-app' | 'preload-webview'): string =>
  path.resolve(__dirname, `../../dist/preload/${name}.js`);

const createWindow = (preload: string, contextIsolation: boolean): BrowserWindow =>
  new BrowserWindow({
    show: false,
    webPreferences: {
      additionalArguments: createRendererRuntimeArguments({locale: 'en-US', userDataPath: app.getPath('userData')}),
      contextIsolation,
      nodeIntegration: false,
      preload,
      sandbox: false,
    },
  });

describe('legacy preload compatibility surface', () => {
  const windows: BrowserWindow[] = [];
  const provideManagedConfig = (event: Electron.IpcMainEvent): void => {
    event.returnValue = {applockOverride: false};
  };

  beforeEach(() => ipcMain.on(MANAGED_CONFIG_CHANNEL, provideManagedConfig));

  afterEach(() => {
    ipcMain.removeListener(MANAGED_CONFIG_CHANNEL, provideManagedConfig);
    for (const window of windows.splice(0)) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
  });

  it('[characterization][security-target][INV-002][SEC-005] exposes the local-shell API used by the wrapper', async () => {
    const window = createWindow(preloadPath('preload-app'), true);
    windows.push(window);
    await window.loadURL('data:text/html,<main>shell</main>');

    const surface = await window.webContents.executeJavaScript(`({
      isMac: typeof window.isMac,
      locale: window.locale,
      locStrings: typeof window.locStrings,
      locStringsDefault: typeof window.locStringsDefault,
      sendBadgeCount: typeof window.sendBadgeCount,
      sendConversationJoinToHost: typeof window.sendConversationJoinToHost,
      sendDeleteAccount: typeof window.sendDeleteAccount,
      sendLogoutAccount: typeof window.sendLogoutAccount,
      submitDeepLink: typeof window.submitDeepLink
    })`);

    assert.deepStrictEqual(surface, {
      isMac: 'boolean',
      locale: 'en',
      locStrings: 'object',
      locStringsDefault: 'object',
      sendBadgeCount: 'function',
      sendConversationJoinToHost: 'function',
      sendDeleteAccount: 'function',
      sendLogoutAccount: 'function',
      submitDeepLink: 'function',
    });
    assert.strictEqual(
      await window.webContents.executeJavaScript(
        "Object.getOwnPropertyDescriptor(window, 'sendDeleteAccount').writable",
      ),
      false,
    );
    assert.match(
      await window.webContents.executeJavaScript(
        "window.sendDeleteAccount('missing-account').then(() => 'resolved', error => String(error))",
      ),
      /does not exist/,
    );
  });

  it('[characterization][security-target][INV-002][SEC-005] exposes the versioned API consumed by the webapp', async function () {
    this.timeout(10_000);
    const window = createWindow(preloadPath('preload-webview'), false);
    windows.push(window);
    await window.loadURL(`data:text/html,<script>
      window.amplify = {publish() {}, subscribe() {}, unsubscribe() {}};
      window.wire = {};
      window.z = {event: {}, lifecycle: {UPDATE_SOURCE: {DESKTOP: 'desktop'}}, util: {Environment: {
        avsVersion() { return 'avs'; },
        version() { return 'webapp'; }
      }}};
    </script>`);

    const surface = await window.webContents.executeJavaScript(`({
      desktopAppConfigVersion: typeof window.desktopAppConfig.version,
      supportsWebViewRefresh: window.desktopAppConfig.supportsWebViewRefresh,
      desktopCapturer: typeof window.desktopCapturer.getDesktopSources,
      environment: typeof window.environment,
      openGraphAsync: typeof window.openGraphAsync,
      systemCryptoDecrypt: typeof window.systemCrypto.decrypt,
      systemCryptoEncrypt: typeof window.systemCrypto.encrypt,
      systemCryptoVersion: window.systemCrypto.version
    })`);

    assert.deepStrictEqual(surface, {
      desktopAppConfigVersion: 'string',
      desktopCapturer: 'function',
      environment: 'object',
      openGraphAsync: 'function',
      systemCryptoDecrypt: 'function',
      systemCryptoEncrypt: 'function',
      systemCryptoVersion: 1,
      supportsWebViewRefresh: true,
    });
  });
});
