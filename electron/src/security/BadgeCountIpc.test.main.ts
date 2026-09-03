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
  BADGE_COUNT_CAPABILITY,
  BADGE_COUNT_CHANNEL,
  bindBadgeCountIpc,
  MAX_BADGE_UPDATES_PER_MINUTE,
  requestBadgeCountUpdate,
} from './BadgeCountIpc';
import {registerApplicationShellIdentity, SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 121): SenderIdentity => {
  const frame = {url: 'file:///opt/wire/electron/renderer/index.html'};
  const session = {};
  const webContents = {
    id,
    isDestroyed: () => false,
    mainFrame: frame,
    once: () => webContents,
    session,
  };
  registerApplicationShellIdentity(registry, webContents, frame.url, [BADGE_COUNT_CAPABILITY]);
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

describe('badge-count IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003][DCP-006] invokes only the fixed channel with the exact badge request', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];

    await requestBadgeCountUpdate(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      },
      {error: (...args: unknown[]) => errors.push(args)},
      7,
      true,
    );

    assert.deepStrictEqual(calls, [[BADGE_COUNT_CHANNEL, {count: 7, ignoreFlash: true}]]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-010][SEC-003][DCP-006] reports rejected badge updates', async () => {
    const controlledFailure = new Error('controlled badge failure');
    const errors: unknown[][] = [];

    await requestBadgeCountUpdate(
      {invoke: async () => Promise.reject(controlledFailure)},
      {error: (...args: unknown[]) => errors.push(args)},
      1,
      false,
    );

    assert.deepStrictEqual(errors, [['Failed to update the application badge count.', controlledFailure]]);
  });

  it('[characterization][security-target][INV-003][SEC-003][DCP-006] preserves count and flash policy', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const updates: Array<{count: number; ignoreFlash: boolean}> = [];
    const dispose = bindBadgeCountIpc(createIpc(handlers), registry, (count, ignoreFlash) => {
      updates.push({count, ignoreFlash});
    });
    const handler = handlers.get(BADGE_COUNT_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, {count: 7, ignoreFlash: true}), undefined);
    assert.deepStrictEqual(updates, [{count: 7, ignoreFlash: true}]);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-006] rejects unauthorized and malformed badge updates', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let updateCalls = 0;
    bindBadgeCountIpc(createIpc(handlers), registry, () => {
      updateCalls += 1;
    });
    const handler = handlers.get(BADGE_COUNT_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 122}};
    await assert.rejects(() => handler(unknownEvent, {count: 1, ignoreFlash: false}), /not authorized/);
    for (const request of [
      undefined,
      {count: 0},
      {count: 0, ignoreFlash: false, extra: true},
      {count: -1, ignoreFlash: false},
      {count: 1.5, ignoreFlash: false},
      {count: Number.MAX_SAFE_INTEGER + 1, ignoreFlash: false},
      {count: Number.NaN, ignoreFlash: false},
      {count: 1, ignoreFlash: 'false'},
    ]) {
      await assert.rejects(() => handler(event, request), /payload/);
    }
    assert.strictEqual(updateCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-006] limits badge updates per application shell', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let updateCalls = 0;
    bindBadgeCountIpc(createIpc(handlers), registry, () => {
      updateCalls += 1;
    });
    const handler = handlers.get(BADGE_COUNT_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_BADGE_UPDATES_PER_MINUTE; request += 1) {
      await handler(event, {count: request, ignoreFlash: false});
    }
    await assert.rejects(() => handler(event, {count: 0, ignoreFlash: false}), /rate limit/);
    assert.strictEqual(updateCalls, MAX_BADGE_UPDATES_PER_MINUTE);
  });
});
