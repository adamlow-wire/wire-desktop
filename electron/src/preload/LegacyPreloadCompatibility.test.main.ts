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
import {pathToFileURL} from 'url';

import {WebAppEvents} from '@wireapp/webapp-events';

import {parseLegacyAccounts} from '../accounts/AccountProfile';
import {AccountState} from '../accounts/AccountState';
import * as EnvironmentUtil from '../runtime/EnvironmentUtil';
import {snapshotRendererEnvironment} from '../runtime/rendererEnvironment';
import {createRendererRuntimeArguments} from '../runtime/rendererRuntimeArguments';
import {ACCOUNT_CONTROL_CAPABILITY} from '../security/AccountControlContract';
import {bindAccountControlIpc} from '../security/AccountControlIpc';
import {MANAGED_CONFIG_CHANNEL} from '../security/ManagedConfigContract';
import {registerApplicationShellIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

const preloadPath = (name: 'preload-app' | 'preload-webview' | 'preload-shell'): string =>
  path.resolve(__dirname, `../../dist/preload/${name}.js`);

const createWindow = (preload: string, contextIsolation: boolean, partition?: string): BrowserWindow =>
  new BrowserWindow({
    show: false,
    webPreferences: {
      additionalArguments: createRendererRuntimeArguments({
        locale: 'en-US',
        userDataPath: app.getPath('userData'),
        environment: snapshotRendererEnvironment(EnvironmentUtil),
      }),
      contextIsolation,
      nodeIntegration: false,
      partition,
      preload,
      sandbox: true,
      nodeIntegrationInWorker: false,
    },
  });

const WEBAPP_FIXTURE = `data:text/html,<script>
  window.desktopSubscriptions = [];
  window.amplify = {
    publish() {},
    subscribe(name) { window.desktopSubscriptions.push(name); },
    unsubscribe() {}
  };
  window.wire = {};
  window.z = {event: {}, lifecycle: {UPDATE_SOURCE: {DESKTOP: 'desktop'}}, util: {Environment: {
    avsVersion() { return 'avs'; },
    version() { return 'webapp'; }
  }}};
</script>`;

describe('legacy preload compatibility surface', () => {
  const windows: BrowserWindow[] = [];
  let disposeShell: (() => void) | undefined;
  const loadCurrentShell = async (partition: string): Promise<BrowserWindow> => {
    const window = createWindow(preloadPath('preload-shell'), true, partition);
    windows.push(window);
    const url = pathToFileURL(path.resolve(__dirname, '../../renderer/index.html'));
    url.searchParams.set('noUrlConfigured', 'true');
    const registry = new ViewIdentityRegistry();
    registerApplicationShellIdentity(registry, window.webContents, url.href, [ACCOUNT_CONTROL_CAPABILITY]);
    const state = new AccountState(parseLegacyAccounts('{"accounts":[]}', 3), 3, () => undefined);
    const unavailable = async (): Promise<void> => {
      throw new Error('Not part of the CSP fixture');
    };
    disposeShell = bindAccountControlIpc(ipcMain, registry, {
      snapshots: () => state.snapshots(),
      layout: async () => undefined,
      add: unavailable,
      select: unavailable,
      remove: unavailable,
      reload: unavailable,
      logout: unavailable,
      contextMenu: unavailable,
      join: unavailable,
    });
    await window.loadURL(url.href);
    await window.webContents.executeJavaScript(`new Promise(resolve => {
      const ready = () => !!document.querySelector('[data-uie-name="status-no-url-configured"]');
      if (ready()) { resolve(true); return; }
      const observer = new MutationObserver(() => {
        if (ready()) { observer.disconnect(); resolve(true); }
      });
      observer.observe(document.documentElement, {childList: true, subtree: true});
    })`);
    return window;
  };
  const provideManagedConfig = (event: Electron.IpcMainEvent): void => {
    event.returnValue = {applockOverride: false};
  };

  beforeEach(() => ipcMain.on(MANAGED_CONFIG_CHANNEL, provideManagedConfig));

  afterEach(() => {
    disposeShell?.();
    disposeShell = undefined;
    ipcMain.removeListener(MANAGED_CONFIG_CHANNEL, provideManagedConfig);
    for (const window of windows.splice(0)) {
      if (!window.isDestroyed()) {
        window.destroy();
      }
    }
  });

  it('[characterization][SEC-010] renders the real local shell bundle under its production CSP', async function () {
    this.timeout(10_000);
    const window = await loadCurrentShell('local-shell-csp');

    assert.strictEqual(
      await window.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-uie-name="status-no-url-configured"]'))`,
      ),
      true,
    );
  });

  it('[security-target][SEC-010] blocks eval and Function in an ordinary shell script', async function () {
    this.timeout(10_000);
    const window = await loadCurrentShell('local-shell-csp-denial');
    const probeUrl = pathToFileURL(path.resolve(__dirname, '../../test/fixtures/csp-probe.js')).href;
    // Load a normal script: debugger/executeJavaScript evaluation can bypass CSP.
    const result = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.onload = () => resolve(JSON.parse(document.documentElement.getAttribute('data-csp-probe')));
      script.onerror = () => reject(new Error('CSP probe script failed to load'));
      script.src = ${JSON.stringify(probeUrl)};
      document.head.appendChild(script);
    })`);

    assert.deepStrictEqual(result, {eval: 'EvalError', function: 'EvalError'});
  });

  it('[security-target][INV-001][SEC-006] loads both product preloads with effective sandbox preferences', async function () {
    this.timeout(10_000);
    for (const name of ['preload-app', 'preload-webview'] as const) {
      const window = createWindow(preloadPath(name), true);
      windows.push(window);
      const failures: Error[] = [];
      window.webContents.on('preload-error', (_event, _path, error) => failures.push(error));
      await window.loadURL(WEBAPP_FIXTURE);
      const preferences = (
        window.webContents as Electron.WebContents & {getLastWebPreferences(): Electron.WebPreferences}
      ).getLastWebPreferences();
      assert.strictEqual(preferences.sandbox, true);
      assert.strictEqual(preferences.contextIsolation, true);
      assert.strictEqual(preferences.nodeIntegration, false);
      assert.strictEqual(preferences.nodeIntegrationInSubFrames, false);
      // Electron 43 omits nodeIntegrationInWorker from getLastWebPreferences.
      // Exercise a real worker rather than treating an absent field as false.
      const workerSurface = await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob(['postMessage({require: typeof require, process: typeof process})'], {type: 'text/javascript'}));
        const worker = new Worker(url);
        worker.onmessage = event => { worker.terminate(); URL.revokeObjectURL(url); resolve(event.data); };
        worker.onerror = event => { worker.terminate(); URL.revokeObjectURL(url); reject(new Error(event.message)); };
      })`);
      assert.deepStrictEqual(workerSurface, {require: 'undefined', process: 'undefined'});
      assert.deepStrictEqual(failures, []);
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
    const window = createWindow(preloadPath('preload-webview'), true);
    windows.push(window);
    await window.loadURL(WEBAPP_FIXTURE);

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

  it('[security-target][INV-001][INV-002][SEC-005] preserves the webapp API through an isolated bridge', async function () {
    this.timeout(10_000);
    const window = createWindow(preloadPath('preload-webview'), true);
    windows.push(window);
    await window.loadURL(WEBAPP_FIXTURE);

    const surface = await window.webContents.executeJavaScript(`({
      bridgeVersion: window.wireDesktopBridge?.version,
      desktopAppConfigVersion: typeof window.desktopAppConfig?.version,
      desktopCapturer: typeof window.desktopCapturer?.getDesktopSources,
      electron: typeof window.electron,
      environment: typeof window.environment,
      openGraphAsync: typeof window.openGraphAsync,
      process: typeof window.process,
      require: typeof window.require,
      systemCryptoDecrypt: typeof window.systemCrypto?.decrypt,
      systemCryptoEncrypt: typeof window.systemCrypto?.encrypt,
      systemCryptoVersion: window.systemCrypto?.version
    })`);

    assert.deepStrictEqual(surface, {
      bridgeVersion: 1,
      desktopAppConfigVersion: 'string',
      desktopCapturer: 'function',
      electron: 'undefined',
      environment: 'object',
      openGraphAsync: 'function',
      process: 'undefined',
      require: 'undefined',
      systemCryptoDecrypt: 'function',
      systemCryptoEncrypt: 'function',
      systemCryptoVersion: 1,
    });
    assert.strictEqual(
      await window.webContents.executeJavaScript("Object.getOwnPropertyDescriptor(window, 'systemCrypto').writable"),
      false,
    );
    const subscriptions = await window.webContents.executeJavaScript(
      'new Promise(resolve => setTimeout(() => resolve(window.desktopSubscriptions), 750))',
    );
    assert.ok(subscriptions.includes(WebAppEvents.LIFECYCLE.LOADED));
    assert.ok(subscriptions.includes(WebAppEvents.LIFECYCLE.REFRESH));
    assert.ok(subscriptions.includes(WebAppEvents.TEAM.INFO));
  });
});
