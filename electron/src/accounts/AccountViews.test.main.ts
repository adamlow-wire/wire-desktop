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

import {BrowserWindow, WebContents, WebContentsView} from 'electron';
import {stub} from 'sinon';

import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';
import {createServer, Server} from 'http';
import {AddressInfo} from 'net';
import path from 'path';

import {AccountViews} from './AccountViews';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

describe('main-owned native account views', () => {
  let server: Server;
  let origin: string;
  let redirectUrl: string;
  let window: BrowserWindow;
  let registry: ViewIdentityRegistry;
  let views: AccountViews;
  const options = (configure = async (_contents: WebContents) => undefined) => ({
    window,
    registry,
    preload: path.join(process.cwd(), 'electron/dist/preload/preload-secure-account.js'),
    additionalArguments: [],
    capabilities: ['test:account'],
    configure,
    lost: () => undefined,
  });
  const record = () => ({id: randomUUID(), sessionID: randomUUID()});
  const nativeView = (contents: WebContents): WebContentsView =>
    window.contentView.children.find(view => (view as WebContentsView).webContents === contents) as WebContentsView;

  beforeEach(async () => {
    server = createServer((request, response) => {
      if (request.url?.startsWith('/redirect')) {
        response.writeHead(302, {Location: redirectUrl});
      }
      response.end('<!doctype html><title>Account fixture</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    window = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false},
    });
    registry = new ViewIdentityRegistry();
    views = new AccountViews(options());
  });

  afterEach(async () => {
    await views.dispose();
    if (!window.isDestroyed()) {
      window.destroy();
    }
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  it('[security-target][CAP-001] registers main-owned identity before navigation with effective secure preferences', async () => {
    const account = record();
    await views.dispose();
    views = new AccountViews(
      options(async contents => {
        assert.equal(registry.has(contents.id), true);
        assert.equal(contents.getURL(), '');
      }),
    );
    const contents = await views.create(account, `${origin}/?id=renderer-spoof`);
    assert.equal(new URL(contents.getURL()).searchParams.get('id'), account.id);
    const identity = registry.authorize({sender: contents, senderFrame: contents.mainFrame}, 'test:account');
    assert.equal(identity.accountId, account.id);
    assert.equal(identity.partition, account.sessionID);
    assert.equal(identity.session, contents.session);
    const preferences = (
      contents as WebContents & {getLastWebPreferences(): Electron.WebPreferences}
    ).getLastWebPreferences();
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.webviewTag, false);
    assert.equal(await contents.executeJavaScript('typeof require + ":" + typeof process'), 'undefined:undefined');
  });

  it('[migration][CAP-001] preserves legacy default sessions and isolates persistent account cookies', async () => {
    const first = record();
    const second = record();
    const firstContents = await views.create(first, origin);
    const secondContents = await views.create(second, origin);
    assert.notEqual(firstContents.session, secondContents.session);
    await firstContents.session.cookies.set({url: origin, name: 'account-marker', value: first.id});
    assert.equal((await firstContents.session.cookies.get({name: 'account-marker'}))[0].value, first.id);
    assert.deepEqual(await secondContents.session.cookies.get({name: 'account-marker'}), []);
    const legacy = await views.create({id: randomUUID()}, origin);
    assert.equal(
      registry.authorize({sender: legacy, senderFrame: legacy.mainFrame}, 'test:account').partition,
      'default',
    );
    assert.equal(legacy.session, window.webContents.session);
    await views.close(first.id);
    const reopened = await views.create(first, origin);
    assert.equal((await reopened.session.cookies.get({name: 'account-marker'}))[0].value, first.id);
  });

  it('[characterization][CAP-001] selects, resizes and closes only the intended native view', async () => {
    const first = record();
    const second = record();
    const firstContents = await views.create(first, origin);
    const secondContents = await views.create(second, origin);
    views.select(first.id);
    assert.equal(nativeView(firstContents).getVisible(), true);
    assert.equal(nativeView(secondContents).getVisible(), false);
    views.select(second.id);
    assert.equal(nativeView(firstContents).getVisible(), false);
    assert.equal(nativeView(secondContents).getVisible(), true);
    views.setChrome(80, 40);
    const bounds = window.getContentBounds();
    assert.deepEqual(nativeView(secondContents).getBounds(), {
      x: 80,
      y: 40,
      width: bounds.width - 80,
      height: bounds.height - 40,
    });
    let revokedAtDestruction = false;
    firstContents.once('destroyed', () => {
      revokedAtDestruction = !registry.has(firstContents.id);
    });
    await views.close(first.id);
    assert.equal(revokedAtDestruction, true);
    assert.equal(firstContents.isDestroyed(), true);
    assert.equal(views.get(second.id), secondContents);
    assert.throws(() => views.select('unknown'), /Unknown/);
    assert.throws(() => views.setChrome(-1, 0), /dimensions/);
    assert.throws(() => views.setChrome(80, 121), /dimensions/);
  });

  it('[security-target][CAP-001] cleans up failed configuration and rejects duplicate or malformed identity', async () => {
    const account = record();
    const contents = await views.create(account, origin);
    await assert.rejects(views.create(account, origin), /cannot be created/);
    await assert.rejects(views.create({...account, id: '../outside'}, origin), /cannot be created/);
    await assert.rejects(views.create({...record(), sessionID: '../outside'}, origin), /cannot be created/);
    await assert.rejects(views.create(record(), 'file:///private'), /cannot be created/);
    assert.equal(views.get(account.id), contents);
    await views.dispose();
    let failed: WebContents | undefined;
    views = new AccountViews(
      options(async created => {
        failed = created;
        throw new Error('Setup failed');
      }),
    );
    await assert.rejects(views.create(record(), origin), /Setup failed/);
    assert.equal(failed!.isDestroyed(), true);
    assert.equal(registry.has(failed!.id), false);
  });

  it('[security-target][CAP-001] closes every owned native view on disposal and refuses later creation', async () => {
    const first = await views.create(record(), origin);
    const second = await views.create(record(), origin);
    await views.dispose();
    assert.equal(first.isDestroyed(), true);
    assert.equal(second.isDestroyed(), true);
    assert.equal(registry.has(first.id), false);
    assert.equal(registry.has(second.id), false);
    await assert.rejects(views.create(record(), origin), /cannot be created/);
  });

  it('[security-target][CAP-001] rejects cross-account partition aliases', async () => {
    const first = record();
    await views.create(first, origin);
    await assert.rejects(
      views.create({...record(), sessionID: first.sessionID.toUpperCase()}, origin),
      /cannot be created/,
    );
    await views.create({id: randomUUID()}, origin);
    await assert.rejects(views.create({id: randomUUID()}, origin), /cannot be created/);
  });

  it('[security-target][CAP-001] waits for an in-flight close and prevents premature recreation', async () => {
    const account = record();
    const contents = await views.create(account, origin);
    const nativeClose = contents.close.bind(contents);
    const close = stub(contents, 'close').callsFake(options => {
      setImmediate(() => nativeClose(options));
    });
    try {
      const closing = views.close(account.id);
      const waiting = views.close(account.id);
      await assert.rejects(views.create(account, origin), /cannot be created/);
      await waiting;
      assert.equal(contents.isDestroyed(), true);
      await closing;
    } finally {
      close.restore();
    }
  });

  it('[security-target][CAP-001] revokes a lost renderer before recovery without closing another account', async function () {
    this.timeout(15_000);
    await views.dispose();
    let resolveLoss: (id: string) => void;
    const lost = new Promise<string>(resolve => {
      resolveLoss = resolve;
    });
    views = new AccountViews({...options(), lost: id => resolveLoss(id)});
    const account = record();
    const failed = await views.create(account, origin);
    const retained = await views.create(record(), origin);
    const failedId = failed.id;
    const failedSession = failed.session;
    const rendererPid = failed.getOSProcessId();
    assert.ok(rendererPid > 0 && rendererPid !== process.pid && rendererPid !== retained.getOSProcessId());
    process.kill(rendererPid, 'SIGKILL');
    assert.equal(await lost, account.id);
    assert.equal(registry.has(failedId), false);
    assert.equal(failed.isDestroyed(), true);
    assert.equal(retained.isDestroyed(), false);
    const replacement = await views.create(account, origin);
    assert.notEqual(replacement.id, failedId);
    assert.equal(replacement.session, failedSession);
  });

  it('[security-target][CAP-001] blocks a foreign redirect before fetching it and denies unconfigured popups', async () => {
    let foreignRequests = 0;
    const foreign = createServer((_request, response) => {
      foreignRequests++;
      response.end('foreign');
    });
    await new Promise<void>(resolve => foreign.listen(0, '127.0.0.1', resolve));
    redirectUrl = `http://127.0.0.1:${(foreign.address() as AddressInfo).port}`;
    try {
      const account = record();
      await assert.rejects(views.create(account, `${origin}/redirect`));
      assert.throws(() => views.get(account.id), /Unknown/);
      const contents = await views.create(record(), origin);
      assert.equal(await contents.executeJavaScript(`window.open(${JSON.stringify(redirectUrl)}) === null`), true);
      assert.equal(foreignRequests, 0);
    } finally {
      await new Promise<void>((resolve, reject) => foreign.close(error => (error ? reject(error) : resolve())));
    }
  });

  it('[security-target][CAP-001] a cancelled initialization cannot destroy its replacement', async () => {
    await views.dispose();
    let release: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let first = true;
    views = new AccountViews(
      options(async () => {
        if (first) {
          first = false;
          await gate;
        }
      }),
    );
    const account = record();
    const cancelled = assert.rejects(views.create(account, origin), /cancelled/);
    await views.close(account.id);
    const replacement = await views.create(account, origin);
    release!();
    await cancelled;
    assert.equal(views.get(account.id), replacement);
    assert.equal(replacement.isDestroyed(), false);
  });

  it('[security-target][CAP-001] tolerates externally destroyed views without retaining authority', async () => {
    const account = record();
    const contents = await views.create(account, origin);
    const id = contents.id;
    const destroyed = new Promise<void>(resolve => contents.once('destroyed', () => resolve()));
    contents.close({waitForBeforeUnload: false});
    await destroyed;
    assert.equal(registry.has(id), false);
    assert.throws(() => views.get(account.id), /Unknown/);
    await views.close(account.id);
    await views.close(account.id);
  });

  it('[security-target][CAP-001] parent destruction waits for all child teardown', async () => {
    const contents = await views.create(record(), origin);
    window.destroy();
    await views.dispose();
    assert.equal(contents.isDestroyed(), true);
    views.setChrome(0, 0);
  });
});
