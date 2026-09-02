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

import {app, WebContents, WebContentsView, WebPreferences} from 'electron';

import * as assert from 'assert';
import {createServer, Server} from 'http';
import {AddressInfo} from 'net';
import * as path from 'path';

import {bindSecureShellIpc} from './ipc';
import {installSecureShellProtocol} from './protocol';
import {SecureShellController} from './SecureShellController';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

const FIXTURE_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>secure account fixture</title>
  </head>
  <body><iframe src="/frame"></iframe></body>
</html>`;

const waitFor = async (predicate: () => boolean, timeout = 10_000): Promise<void> => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for secure shell state.');
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};

const getLastWebPreferences = (webContents: WebContents): WebPreferences => {
  const inspectedContents = webContents as WebContents & {getLastWebPreferences(): WebPreferences};
  return inspectedContents.getLastWebPreferences();
};

describe('SecureShellController', () => {
  let accountUrl: string;
  let disposeIpc: (() => void) | undefined;
  let disposeProtocol: (() => void) | undefined;
  let registry: ViewIdentityRegistry;
  let server: Server;
  const controllers: SecureShellController[] = [];

  before(async () => {
    await app.whenReady();
    server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, {Location: 'https://example.com/escape'});
        response.end();
        return;
      }
      response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      response.end(FIXTURE_HTML);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    accountUrl = `http://127.0.0.1:${address.port}/account`;
    registry = new ViewIdentityRegistry();
    disposeProtocol = installSecureShellProtocol();
    disposeIpc = bindSecureShellIpc(registry);
  });

  afterEach(() => {
    while (controllers.length) {
      controllers.pop()?.dispose();
    }
  });

  after(async () => {
    disposeIpc?.();
    disposeProtocol?.();
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  const createController = async (accountId: string, show = false): Promise<SecureShellController> => {
    const controller = new SecureShellController(
      {
        accountId,
        accountPreload: path.join(process.cwd(), 'electron/dist/preload/preload-secure-account.js'),
        accountUrl,
        allowHttpForTest: true,
        show,
      },
      registry,
    );
    controllers.push(controller);
    await controller.start();
    return controller;
  };

  const getVisibleAccountContentsIds = (controller: SecureShellController): number[] => {
    const window = controller.getWindowForTest();
    assert.ok(window);
    return window.contentView.children
      .filter(view => view.getVisible())
      .map(view => (view as WebContentsView).webContents.id);
  };

  it('[security-target][INV-003][ARC-002] owns the shell lifecycle and revokes authority on disposal', async function () {
    this.timeout(10_000);
    const controller = await createController('account-a', true);
    const window = controller.getWindowForTest();
    const webContents = controller.getAccountWebContentsForTest();
    assert.ok(window);
    assert.ok(webContents);
    assert.strictEqual(registry.has(window.webContents.id), true);
    assert.strictEqual(window.isVisible(), true);
    await assert.rejects(controller.start(), /already running/);

    const shellUrl = window.webContents.getURL();
    assert.strictEqual(await window.webContents.executeJavaScript("window.open('https://example.com')"), null);
    await window.webContents.executeJavaScript("location.href = 'https://example.com/escape'");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(window.webContents.getURL(), shellUrl);
    window.setSize(900, 700);
    await new Promise(resolve => setTimeout(resolve, 100));

    window.hide();
    assert.strictEqual(window.isVisible(), false);
    controller.show();
    assert.strictEqual(window.isVisible(), true);

    const registeredId = webContents.id;
    const registeredShellId = window.webContents.id;
    controller.dispose();
    assert.strictEqual(window.isDestroyed(), true);
    assert.strictEqual(registry.has(registeredId), false);
    assert.strictEqual(registry.has(registeredShellId), false);
    assert.strictEqual(controller.getWindowForTest(), undefined);
    assert.strictEqual(controller.getAccountWebContentsForTest(), undefined);

    controller.dispose();
  });

  it('[security-target][INV-001][INV-002][INV-003][ARC-002] exposes only the isolated fixed bridge', async () => {
    const controller = await createController('account-a');
    const webContents = controller.getAccountWebContentsForTest();
    assert.ok(webContents);

    const preferences = getLastWebPreferences(webContents);
    assert.strictEqual(preferences.contextIsolation, true);
    assert.strictEqual(preferences.nodeIntegration, false);
    assert.notStrictEqual(preferences.nodeIntegrationInWorker, true);
    assert.strictEqual(preferences.sandbox, true);
    assert.notStrictEqual(preferences.webviewTag, true);

    const exposed = await webContents.executeJavaScript(`({
      electron: typeof window.electron,
      nodeRequire: typeof window.require,
      process: typeof window.process,
      bridge: Object.keys(window.wireDesktopProof),
      frozen: Object.isFrozen(window.wireDesktopProof)
    })`);
    assert.deepStrictEqual(exposed, {
      electron: 'undefined',
      nodeRequire: 'undefined',
      process: 'undefined',
      bridge: ['getRuntimeInfo'],
      frozen: true,
    });
    assert.deepStrictEqual(await webContents.executeJavaScript('window.wireDesktopProof.getRuntimeInfo()'), {
      accountId: 'account-a',
      contractVersion: 1,
    });
  });

  it('[security-target][INV-004][ARC-002] isolates persistent account storage', async () => {
    const first = await createController('account-a');
    const second = await createController('account-b');
    const firstContents = first.getAccountWebContentsForTest();
    const secondContents = second.getAccountWebContentsForTest();
    assert.ok(firstContents);
    assert.ok(secondContents);

    await firstContents.executeJavaScript("localStorage.setItem('isolation-proof', 'account-a')");
    assert.strictEqual(await secondContents.executeJavaScript("localStorage.getItem('isolation-proof')"), null);
    assert.notStrictEqual(firstContents.session, secondContents.session);
  });

  it('[migration][INV-003][INV-004][INV-010][DCP-002][CAP-001] adds, switches, and removes only the targeted account', async () => {
    const controller = await createController('account-a');
    const firstContents = controller.getAccountWebContentsForTest('account-a');
    assert.ok(firstContents);
    await firstContents.executeJavaScript("localStorage.setItem('selection-proof', 'account-a')");

    await controller.addAccount('account-b');
    const secondContents = controller.getAccountWebContentsForTest('account-b');
    assert.ok(secondContents);
    assert.deepStrictEqual(controller.getAccountIds(), ['account-a', 'account-b']);
    assert.strictEqual(controller.getActiveAccountId(), 'account-b');
    assert.deepStrictEqual(getVisibleAccountContentsIds(controller), [secondContents.id]);
    assert.notStrictEqual(firstContents.session, secondContents.session);
    assert.strictEqual(await secondContents.executeJavaScript("localStorage.getItem('selection-proof')"), null);

    controller.switchAccount('account-a');
    assert.strictEqual(controller.getActiveAccountId(), 'account-a');
    assert.deepStrictEqual(getVisibleAccountContentsIds(controller), [firstContents.id]);

    controller.switchAccount('account-b');
    controller.removeAccount('account-a');
    assert.deepStrictEqual(controller.getAccountIds(), ['account-b']);
    assert.strictEqual(controller.getActiveAccountId(), 'account-b');
    assert.deepStrictEqual(getVisibleAccountContentsIds(controller), [secondContents.id]);
    assert.strictEqual(registry.has(firstContents.id), false);
    await waitFor(() => firstContents.isDestroyed());
    assert.strictEqual(firstContents.isDestroyed(), true);
    assert.deepStrictEqual(await secondContents.executeJavaScript('window.wireDesktopProof.getRuntimeInfo()'), {
      accountId: 'account-b',
      contractVersion: 1,
    });
  });

  it('[security-target][INV-004][INV-010][DCP-004][CAP-001] deletes only the targeted account storage', async function () {
    this.timeout(10_000);
    const controller = await createController('account-a');
    const firstContents = controller.getAccountWebContentsForTest('account-a');
    assert.ok(firstContents);
    await firstContents.executeJavaScript("localStorage.setItem('deletion-proof', 'account-a')");
    await firstContents.session.cookies.set({name: 'deletion-proof', url: accountUrl, value: 'account-a'});

    await controller.addAccount('account-b');
    const secondContents = controller.getAccountWebContentsForTest('account-b');
    assert.ok(secondContents);
    await secondContents.executeJavaScript("localStorage.setItem('deletion-proof', 'account-b')");
    await secondContents.session.cookies.set({name: 'deletion-proof', url: accountUrl, value: 'account-b'});

    controller.switchAccount('account-a');
    await controller.deleteAccount('account-a');
    await waitFor(() => firstContents.isDestroyed());

    assert.deepStrictEqual(controller.getAccountIds(), ['account-b']);
    assert.strictEqual(controller.getActiveAccountId(), 'account-b');
    assert.strictEqual(await secondContents.executeJavaScript("localStorage.getItem('deletion-proof')"), 'account-b');
    assert.strictEqual((await secondContents.session.cookies.get({name: 'deletion-proof'}))[0]?.value, 'account-b');

    await controller.addAccount('account-a');
    const replacementContents = controller.getAccountWebContentsForTest('account-a');
    assert.ok(replacementContents);
    assert.strictEqual(await replacementContents.executeJavaScript("localStorage.getItem('deletion-proof')"), null);
    assert.deepStrictEqual(await replacementContents.session.cookies.get({name: 'deletion-proof'}), []);
  });

  it('[security-target][INV-003][INV-010][CAP-001] fails closed for duplicate or unknown account targets', async () => {
    const controller = await createController('account-a');
    const firstContents = controller.getAccountWebContentsForTest('account-a');
    assert.ok(firstContents);

    await assert.rejects(controller.addAccount('account-a'), /already exists/);
    assert.throws(() => controller.switchAccount('unknown-account'), /Unknown secure account/);
    assert.throws(() => controller.removeAccount('unknown-account'), /Unknown secure account/);
    await assert.rejects(controller.deleteAccount('unknown-account'), /Unknown secure account/);
    assert.deepStrictEqual(controller.getAccountIds(), ['account-a']);
    assert.strictEqual(controller.getActiveAccountId(), 'account-a');
    assert.deepStrictEqual(getVisibleAccountContentsIds(controller), [firstContents.id]);
  });

  it('[security-target][INV-005][INV-006][INV-010][ARC-002] denies popup, navigation, and permissions', async () => {
    const controller = await createController('account-a');
    const webContents = controller.getAccountWebContentsForTest();
    assert.ok(webContents);
    const originalOrigin = new URL(webContents.getURL()).origin;

    assert.strictEqual(await webContents.executeJavaScript("window.open('/popup')"), null);
    assert.strictEqual(await webContents.executeJavaScript('Notification.requestPermission()'), 'denied');
    await webContents.executeJavaScript("location.href = 'https://example.com/escape'");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(new URL(webContents.getURL()).origin, originalOrigin);
    await webContents.executeJavaScript("location.href = '/redirect'");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(new URL(webContents.getURL()).origin, originalOrigin);
  });

  it('[security-target][INV-003][INV-010][ARC-002] revokes authority before crash recovery', async function () {
    this.timeout(15_000);
    const controller = await createController('account-a');
    const failedContents = controller.getAccountWebContentsForTest();
    assert.ok(failedContents);
    const failedId = failedContents.id;
    assert.strictEqual(registry.has(failedId), true);

    failedContents.forcefullyCrashRenderer();
    await waitFor(() => {
      const replacement = controller.getAccountWebContentsForTest();
      return !registry.has(failedId) && Boolean(replacement && replacement.id !== failedId && !replacement.isLoading());
    });

    const recoveredContents = controller.getAccountWebContentsForTest();
    assert.ok(recoveredContents);
    assert.strictEqual(registry.has(failedId), false);
    assert.deepStrictEqual(await recoveredContents.executeJavaScript('window.wireDesktopProof.getRuntimeInfo()'), {
      accountId: 'account-a',
      contractVersion: 1,
    });
  });
});
