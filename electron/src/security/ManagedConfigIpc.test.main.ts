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

import {MANAGED_CONFIG_CAPABILITY, MANAGED_CONFIG_CHANNEL} from './ManagedConfigContract';
import {bindManagedConfigIpc} from './ManagedConfigIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type SyncEvent = SenderIdentity & {returnValue?: unknown};
type BoundHandler = (event: SyncEvent, request: unknown) => void;

const createSender = (registry: ViewIdentityRegistry, id = 81): SyncEvent => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [MANAGED_CONFIG_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

describe('managed configuration IPC contract', () => {
  it('[characterization][security-target][INV-003][SEC-003][DCP-013] returns the complete policy synchronously', () => {
    const handlers = new Map<string, BoundHandler>();
    const ipc = {
      on: (channel: string, handler: BoundHandler) => {
        handlers.set(channel, handler);
      },
      removeListener: (channel: string, handler: BoundHandler) => {
        if (handlers.get(channel) === handler) {
          handlers.delete(channel);
        }
      },
    };
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const dispose = bindManagedConfigIpc(ipc, registry, () => ({applockOverride: true}));

    handlers.get(MANAGED_CONFIG_CHANNEL)?.(event, undefined);
    assert.deepStrictEqual(event.returnValue, {applockOverride: true});
    assert.strictEqual(Object.isFrozen(event.returnValue), true);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-013] rejects hostile senders and payloads before reading policy', () => {
    const handlers = new Map<string, BoundHandler>();
    const ipc = {
      on: (channel: string, handler: BoundHandler) => {
        handlers.set(channel, handler);
      },
      removeListener: () => undefined,
    };
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let reads = 0;
    bindManagedConfigIpc(ipc, registry, () => {
      reads += 1;
      return {applockOverride: false};
    });
    const handler = handlers.get(MANAGED_CONFIG_CHANNEL);
    assert.ok(handler);

    const unknown = {...event, sender: {...event.sender, id: 82}};
    assert.throws(() => handler(unknown, undefined), /not authorized/);
    assert.throws(() => handler(event, {rendererChosen: true}), /payload/);
    assert.strictEqual(reads, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-013] rejects an invalid policy response', () => {
    const handlers = new Map<string, BoundHandler>();
    const ipc = {
      on: (channel: string, handler: BoundHandler) => {
        handlers.set(channel, handler);
      },
      removeListener: () => undefined,
    };
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    bindManagedConfigIpc(ipc, registry, () => ({applockOverride: 'yes'}));
    const handler = handlers.get(MANAGED_CONFIG_CHANNEL);
    assert.ok(handler);

    assert.throws(() => handler(event, undefined), /response/);
    assert.strictEqual(event.returnValue, undefined);
  });
});
