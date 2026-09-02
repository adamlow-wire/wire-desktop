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
  bindWebAppLoadedIpc,
  MAX_WEBAPP_LOADED_EVENTS_PER_MINUTE,
  notifyWebAppLoaded,
  WEBAPP_LOADED_CAPABILITY,
  WEBAPP_LOADED_CHANNEL,
} from './WebAppLoadedIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 111): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [WEBAPP_LOADED_CAPABILITY],
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

describe('webapp-loaded IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003][DCP-002] invokes only the fixed loaded channel', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];

    await notifyWebAppLoaded(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      },
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.deepStrictEqual(calls, [[WEBAPP_LOADED_CHANNEL]]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003][DCP-002] reports rejected loaded notifications', async () => {
    const controlledFailure = new Error('controlled loaded failure');
    const errors: unknown[][] = [];

    await notifyWebAppLoaded(
      {invoke: async () => Promise.reject(controlledFailure)},
      {error: (...args: unknown[]) => errors.push(args)},
    );

    assert.deepStrictEqual(errors, [['Failed to report that the webapp loaded.', controlledFailure]]);
  });

  it('[characterization][security-target][INV-003][SEC-003][DCP-002] flushes queued actions after loading', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let flushCalls = 0;
    const dispose = bindWebAppLoadedIpc(createIpc(handlers), registry, () => {
      flushCalls += 1;
    });
    const handler = handlers.get(WEBAPP_LOADED_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, undefined), undefined);
    assert.strictEqual(flushCalls, 1);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-002] rejects unauthorized and malformed loaded notifications', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let flushCalls = 0;
    bindWebAppLoadedIpc(createIpc(handlers), registry, () => {
      flushCalls += 1;
    });
    const handler = handlers.get(WEBAPP_LOADED_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 112}};
    await assert.rejects(() => handler(unknownEvent, undefined), /not authorized/);
    await assert.rejects(() => handler(event, null), /payload/);
    await assert.rejects(() => handler(event, {}), /payload/);
    assert.strictEqual(flushCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-002] limits queue flush requests per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let flushCalls = 0;
    bindWebAppLoadedIpc(createIpc(handlers), registry, () => {
      flushCalls += 1;
    });
    const handler = handlers.get(WEBAPP_LOADED_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_WEBAPP_LOADED_EVENTS_PER_MINUTE; request += 1) {
      await handler(event, undefined);
    }
    await assert.rejects(() => handler(event, undefined), /rate limit/);
    assert.strictEqual(flushCalls, MAX_WEBAPP_LOADED_EVENTS_PER_MINUTE);
  });
});
