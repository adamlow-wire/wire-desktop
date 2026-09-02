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

import * as assert from 'assert';

import {bindPictureInPictureCallIdentity, registerPictureInPictureCallIdentity} from './PictureInPictureCall';

import {LifecycleWebContentsIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

describe('picture-in-picture call identity', () => {
  it('[security-target][INV-003][INV-004][SEC-002] binds the child view to its account and session', () => {
    const listeners = new Map<string, () => void>();
    const registry = new ViewIdentityRegistry();
    const session = {};
    const webContents: LifecycleWebContentsIdentity = {
      id: 51,
      isDestroyed: () => false,
      mainFrame: {url: 'https://app.wire.test/calling'},
      once(event, listener) {
        listeners.set(event, listener);
        return this;
      },
      session,
    };

    const registered = registerPictureInPictureCallIdentity({
      accountId: 'account-a',
      allowedUrl: 'https://app.wire.test/calling',
      partition: 'persist:account-a',
      registry,
      webContents,
    });

    assert.strictEqual(registered.identity.accountId, 'account-a');
    assert.strictEqual(registered.identity.allowedOrigin, 'https://app.wire.test');
    assert.strictEqual(registered.identity.partition, 'persist:account-a');
    assert.strictEqual(registered.identity.session, session);
    assert.strictEqual(registered.identity.viewType, 'picture-in-picture');
    assert.deepStrictEqual(registered.identity.capabilities, []);
    listeners.get('destroyed')?.();
    assert.strictEqual(registry.has(webContents.id), false);
  });

  it('[security-target][INV-003][INV-010][SEC-002] rejects malformed or unbound child views', () => {
    const createWebContents = (id: number): LifecycleWebContentsIdentity => ({
      id,
      isDestroyed: () => false,
      mainFrame: {url: 'https://app.wire.test/calling'},
      once: () => createWebContents(id),
      session: {},
    });

    for (const accountId of ['', undefined]) {
      assert.throws(() =>
        registerPictureInPictureCallIdentity({
          accountId,
          allowedUrl: 'https://app.wire.test/calling',
          partition: 'persist:account-a',
          registry: new ViewIdentityRegistry(),
          webContents: createWebContents(accountId === '' ? 52 : 53),
        }),
      );
    }
    assert.throws(() =>
      registerPictureInPictureCallIdentity({
        accountId: 'account-a',
        allowedUrl: 'not a URL',
        partition: 'persist:account-a',
        registry: new ViewIdentityRegistry(),
        webContents: createWebContents(54),
      }),
    );
  });

  it('[characterization][security-target][INV-003][INV-010][SEC-002] destroys only rejected picture-in-picture children', () => {
    const createWebContents = (id: number): LifecycleWebContentsIdentity => ({
      id,
      isDestroyed: () => false,
      mainFrame: {url: 'https://app.wire.test/calling'},
      once: () => createWebContents(id),
      session: {},
    });
    let destroyed = false;
    let rejection: unknown;
    let resolvedAccountCount = 0;
    const shared = {
      allowedUrl: 'https://app.wire.test/calling',
      destroy: () => {
        destroyed = true;
      },
      logRejection: (error: unknown) => {
        rejection = error;
      },
      partition: 'persist:account-a',
      registry: new ViewIdentityRegistry(),
      resolveAccountId: () => {
        resolvedAccountCount += 1;
        return 'account-a';
      },
      webContents: createWebContents(55),
    };

    assert.strictEqual(bindPictureInPictureCallIdentity({...shared, frameName: 'ordinary-child'}), true);
    assert.strictEqual(destroyed, false);
    assert.strictEqual(shared.registry.has(shared.webContents.id), false);
    assert.strictEqual(resolvedAccountCount, 0);

    assert.strictEqual(bindPictureInPictureCallIdentity({...shared, frameName: 'WIRE_PICTURE_IN_PICTURE_CALL'}), true);
    assert.strictEqual(shared.registry.has(shared.webContents.id), true);
    assert.strictEqual(resolvedAccountCount, 1);

    assert.strictEqual(
      bindPictureInPictureCallIdentity({
        ...shared,
        frameName: 'WIRE_PICTURE_IN_PICTURE_CALL',
        registry: new ViewIdentityRegistry(),
        resolveAccountId: () => undefined,
        webContents: createWebContents(56),
      }),
      false,
    );
    assert.strictEqual(destroyed, true);
    assert.ok(rejection instanceof Error);
  });
});
