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

import {BrowserWindow, session, Session, WebContents} from 'electron';
import {restore, spy, stub} from 'sinon';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import {createServer, Server} from 'node:http';
import {AddressInfo} from 'node:net';

import {ACCOUNT_PERMISSION_CAPABILITY, AccountPermissionPolicy} from './AccountPermissionPolicy';
import {bindAccountPermissionSession} from './AccountPermissionSession';
import {registerViewIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

describe('[security-target][INV-006][INV-010][SEC-009] native permission session adapter', () => {
  let server: Server;
  let origin: string;
  let target: Session;
  let window: BrowserWindow;
  let contents: WebContents;
  let policy: AccountPermissionPolicy;
  let dispose: () => void;
  let errors: number;
  let requestHandler: NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>;
  let checkHandler: NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>;
  const request = () =>
    new Promise<boolean>(resolve =>
      requestHandler(contents, 'notifications', resolve, {
        isMainFrame: true,
        requestingUrl: `${origin}/account`,
      }),
    );
  const permission = () => contents.executeJavaScript('Notification.permission');

  beforeEach(async () => {
    server = createServer((_request, response) =>
      response.end('<!doctype html><title>Permission adapter fixture</title>'),
    );
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    target = session.fromPartition(`permission-adapter-${randomUUID()}`);
    window = new BrowserWindow({
      show: false,
      webPreferences: {session: target, sandbox: true, contextIsolation: true, nodeIntegration: false},
    });
    contents = window.webContents;
    const registry = new ViewIdentityRegistry();
    const {identity} = registerViewIdentity(registry, {
      accountId: randomUUID(),
      allowedOrigin: origin,
      capabilities: [ACCOUNT_PERMISSION_CAPABILITY],
      partition: 'fixture',
      session: target,
      viewType: 'account',
      webContents: contents,
    });
    policy = new AccountPermissionPolicy(registry, identity, {canPrompt: () => true, ask: async () => true});
    const installedRequest = spy(target, 'setPermissionRequestHandler');
    const installedCheck = spy(target, 'setPermissionCheckHandler');
    errors = 0;
    dispose = bindAccountPermissionSession(target, contents, policy, () => {
      errors++;
    });
    requestHandler = installedRequest.lastCall.args[0]!;
    checkHandler = installedCheck.lastCall.args[0]!;
    await contents.loadURL(`${origin}/account`);
  });

  afterEach(async () => {
    dispose?.();
    restore();
    if (window && !window.isDestroyed()) {
      window.destroy();
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('applies consent to actual notification requests and checks without displaying a notification', async () => {
    assert.equal(await permission(), 'denied');
    assert.equal(await contents.executeJavaScript('Notification.requestPermission()'), 'granted');
    assert.equal(await permission(), 'granted');
    assert.equal(errors, 0);
  });

  it('updates page permission queries after an isolated notification request despite a page override', async () => {
    await contents.executeJavaScript(`(async () => {
      const observer = await navigator.permissions.query({name: 'notifications'});
      window.permissionProbe = {observer, before: observer.state};
      Notification.requestPermission = () => Promise.resolve('page override');
    })()`);
    const requested = await contents.executeJavaScriptInIsolatedWorld(1001, [
      {code: 'Notification.requestPermission()'},
    ]);
    assert.equal(requested, 'granted');
    const result = await contents.executeJavaScript(`(async () => {
      const fresh = await navigator.permissions.query({name: 'notifications'});
      const {before, observer} = window.permissionProbe;
      return {before, observed: observer.state, fresh: fresh.state};
    })()`);
    assert.deepEqual(result, {before: 'denied', observed: 'granted', fresh: 'granted'});
  });

  it('preserves grants for hash navigation but revokes on a real document navigation', async () => {
    assert.equal(await request(), true);
    await contents.executeJavaScript('location.hash = "conversation"');
    assert.equal(await permission(), 'granted');
    await contents.loadURL(`${origin}/next-document`);
    assert.equal(await permission(), 'denied');
    assert.equal(await request(), true);
  });

  it('denies request/check exceptions and reports only a generic failure signal', async () => {
    stub(policy, 'request').rejects(new Error('Sensitive fixture detail'));
    stub(policy, 'check').throws(new Error('Sensitive fixture detail'));
    assert.equal(await request(), false);
    assert.equal(checkHandler(contents, 'notifications', origin, {isMainFrame: true}), false);
    assert.equal(errors, 2);
  });

  it('settles pending consent once on disposal and ignores the late answer', async () => {
    let answer!: (value: boolean) => void;
    stub(policy, 'request').callsFake(
      () =>
        new Promise(resolve => {
          answer = resolve;
        }),
    );
    const values: boolean[] = [];
    const completed = new Promise<void>(resolve =>
      requestHandler(
        contents,
        'notifications',
        value => {
          values.push(value);
          resolve();
        },
        {isMainFrame: true, requestingUrl: origin},
      ),
    );
    await Promise.resolve();
    dispose();
    await completed;
    assert.deepEqual(values, [false]);
    answer(true);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(values, [false]);
    assert.equal(await permission(), 'denied');
    assert.equal(await contents.executeJavaScript('Notification.requestPermission()'), 'denied');
  });

  it('does not let stale disposal disable a replacement binding on the same session', async () => {
    const previous = dispose;
    dispose = bindAccountPermissionSession(target, contents, policy, () => {
      errors++;
    });
    previous();
    assert.equal(await contents.executeJavaScript('Notification.requestPermission()'), 'granted');
    previous();
    assert.equal(await permission(), 'granted');
  });

  it('does not prompt for a queued request cancelled by navigation before policy evaluation', async () => {
    const evaluate = spy(policy, 'request');
    const completed = request();
    contents.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    assert.equal(await completed, false);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(evaluate.callCount, 0);
  });

  it('rejects a mismatched session before disturbing its existing handlers', () => {
    const other = session.fromPartition(`permission-other-${randomUUID()}`);
    const installed = spy(other, 'setPermissionRequestHandler');
    assert.throws(() => bindAccountPermissionSession(other, contents, policy, () => undefined), /session/);
    assert.equal(installed.callCount, 0);
  });

  it('denies another real view in the same session and null checks without reaching the policy', async () => {
    assert.equal(await request(), true);
    const evaluate = spy(policy, 'request');
    const check = spy(policy, 'check');
    assert.equal(checkHandler(null, 'notifications', origin, {isMainFrame: true}), false);
    const other = new BrowserWindow({
      show: false,
      webPreferences: {session: target, sandbox: true, contextIsolation: true, nodeIntegration: false},
    });
    try {
      await other.loadURL(origin);
      assert.equal(await other.webContents.executeJavaScript('Notification.requestPermission()'), 'denied');
      assert.equal(evaluate.callCount, 0);
      assert.equal(check.callCount, 0);
    } finally {
      other.destroy();
    }
  });

  it('settles pending consent on real destruction and rejects rebinding a destroyed view', async () => {
    let answer!: (value: boolean) => void;
    stub(policy, 'request').callsFake(
      () =>
        new Promise(resolve => {
          answer = resolve;
        }),
    );
    const completed = request();
    await Promise.resolve();
    window.destroy();
    assert.equal(await completed, false);
    answer(true);
    assert.throws(() => bindAccountPermissionSession(target, contents, policy, () => undefined), /live view/);
    assert.equal(checkHandler(contents, 'notifications', origin, {isMainFrame: true}), false);
    assert.equal(await request(), false);
  });

  it('keeps a subframe navigation from revoking main-frame grants and disposes on renderer loss', async () => {
    assert.equal(await request(), true);
    contents.emit('did-start-navigation', {isMainFrame: false, isSameDocument: false});
    assert.equal(await permission(), 'granted');
    contents.emit('render-process-gone', {}, {reason: 'crashed', exitCode: 1});
    assert.equal(await permission(), 'denied');
    assert.equal(await request(), false);
  });

  it('contains callback and diagnostic exceptions without repeating a permission answer', async () => {
    requestHandler(
      contents,
      'notifications',
      () => {
        throw new Error('Fixture callback failure');
      },
      {
        isMainFrame: true,
        requestingUrl: origin,
      },
    );
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(errors, 1);
    dispose = bindAccountPermissionSession(target, contents, policy, () => {
      throw new Error('Fixture diagnostic failure');
    });
    stub(policy, 'request').throws(new Error('Fixture synchronous policy failure'));
    assert.equal(await contents.executeJavaScript('Notification.requestPermission()'), 'denied');
  });
});
