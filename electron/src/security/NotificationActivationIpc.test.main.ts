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

import {
  bindNotificationActivationIpc,
  MAX_NOTIFICATION_ACTIVATIONS_PER_MINUTE,
  NOTIFICATION_ACTIVATION_CAPABILITY,
  NOTIFICATION_ACTIVATION_CHANNEL,
  requestNotificationActivation,
} from './NotificationActivationIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 101): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [NOTIFICATION_ACTIVATION_CAPABILITY],
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

describe('notification-activation IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003][DCP-006] invokes only the fixed activation channel', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];

    await requestNotificationActivation(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      },
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.deepStrictEqual(calls, [[NOTIFICATION_ACTIVATION_CHANNEL]]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003][DCP-006] reports rejected activation requests', async () => {
    const controlledFailure = new Error('controlled activation failure');
    const errors: unknown[][] = [];

    await requestNotificationActivation(
      {invoke: async () => Promise.reject(controlledFailure)},
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.deepStrictEqual(errors, [['Failed to activate the application from a notification.', controlledFailure]]);
  });

  it('[characterization][security-target][INV-003][SEC-003][DCP-006] brings the primary window forward', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let activationCalls = 0;
    const dispose = bindNotificationActivationIpc(createIpc(handlers), registry, () => {
      activationCalls += 1;
    });
    const handler = handlers.get(NOTIFICATION_ACTIVATION_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, undefined), undefined);
    assert.strictEqual(activationCalls, 1);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-006] rejects unauthorized and malformed activation requests', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let activationCalls = 0;
    bindNotificationActivationIpc(createIpc(handlers), registry, () => {
      activationCalls += 1;
    });
    const handler = handlers.get(NOTIFICATION_ACTIVATION_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 102}};
    await assert.rejects(() => handler(unknownEvent, undefined), /not authorized/);
    await assert.rejects(() => handler(event, null), /payload/);
    await assert.rejects(() => handler(event, {}), /payload/);
    assert.strictEqual(activationCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-006] limits focus requests per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let activationCalls = 0;
    bindNotificationActivationIpc(createIpc(handlers), registry, () => {
      activationCalls += 1;
    });
    const handler = handlers.get(NOTIFICATION_ACTIVATION_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_NOTIFICATION_ACTIVATIONS_PER_MINUTE; request += 1) {
      await handler(event, undefined);
    }
    await assert.rejects(() => handler(event, undefined), /rate limit/);
    assert.strictEqual(activationCalls, MAX_NOTIFICATION_ACTIVATIONS_PER_MINUTE);
  });
});
