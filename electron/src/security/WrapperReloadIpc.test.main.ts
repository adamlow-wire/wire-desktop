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

import {strict as assert} from 'assert';

import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';
import {
  bindWrapperReloadIpc,
  MAX_WRAPPER_RELOAD_REQUESTS_PER_MINUTE,
  requestWrapperReload,
  WRAPPER_RELOAD_CAPABILITY,
  WRAPPER_RELOAD_REQUEST_CHANNEL,
} from './WrapperReloadIpc';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 131): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [WRAPPER_RELOAD_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => {
    handlers.set(channel, handler);
  },
  removeHandler: (channel: string) => {
    handlers.delete(channel);
  },
});

describe('wrapper-reload IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003][DCP-002] invokes only the fixed reload request channel', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];

    await requestWrapperReload(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      },
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.deepStrictEqual(calls, [[WRAPPER_RELOAD_REQUEST_CHANNEL]]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003][DCP-002] reports rejected reload requests', async () => {
    const controlledFailure = new Error('controlled reload failure');
    const errors: unknown[][] = [];

    await requestWrapperReload(
      {invoke: async () => Promise.reject(controlledFailure)},
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.deepStrictEqual(errors, [['Failed to request an application reload.', controlledFailure]]);
  });

  it('[security-target][INV-002][INV-010][SEC-003][DCP-002] rejects a malformed reload response', async () => {
    const errors: unknown[][] = [];

    await requestWrapperReload(
      {invoke: async () => ({accepted: true})},
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0][0], 'Failed to request an application reload.');
    assert.match(String(errors[0][1]), /response payload is invalid/);
  });

  it('[characterization][security-target][INV-003][SEC-003][DCP-002] preserves the application reload boundary', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let reloadCalls = 0;
    const dispose = bindWrapperReloadIpc(createIpc(handlers), registry, () => {
      reloadCalls += 1;
    });
    const handler = handlers.get(WRAPPER_RELOAD_REQUEST_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, undefined), undefined);
    assert.strictEqual(reloadCalls, 1);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-002] rejects unauthorized and malformed reload requests', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let reloadCalls = 0;
    bindWrapperReloadIpc(createIpc(handlers), registry, () => {
      reloadCalls += 1;
    });
    const handler = handlers.get(WRAPPER_RELOAD_REQUEST_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 132}};
    await assert.rejects(() => handler(unknownEvent, undefined), /not authorized/);
    await assert.rejects(() => handler(event, null), /payload/);
    await assert.rejects(() => handler(event, {}), /payload/);
    assert.strictEqual(reloadCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-002] limits reload requests per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let reloadCalls = 0;
    bindWrapperReloadIpc(createIpc(handlers), registry, () => {
      reloadCalls += 1;
    });
    const handler = handlers.get(WRAPPER_RELOAD_REQUEST_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_WRAPPER_RELOAD_REQUESTS_PER_MINUTE; request += 1) {
      await handler(event, undefined);
    }
    await assert.rejects(() => handler(event, undefined), /rate limit/);
    assert.strictEqual(reloadCalls, MAX_WRAPPER_RELOAD_REQUESTS_PER_MINUTE);
  });
});
