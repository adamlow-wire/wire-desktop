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
  bindDownloadLocationIpc,
  DOWNLOAD_LOCATION_UPDATE_CAPABILITY,
  DOWNLOAD_LOCATION_UPDATE_CHANNEL,
  MAX_DOWNLOAD_LOCATION_LENGTH,
  MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE,
  requestDownloadLocationUpdate,
} from './DownloadLocationIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 161): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [DOWNLOAD_LOCATION_UPDATE_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => handlers.set(channel, handler),
  removeHandler: (channel: string) => handlers.delete(channel),
});

describe('download location IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003] invokes only the fixed channel with an exact request', async () => {
    const calls: unknown[][] = [];
    const errors: unknown[][] = [];

    await requestDownloadLocationUpdate(
      {invoke: async (...args: unknown[]) => void calls.push(args)},
      {error: (...args: unknown[]) => void errors.push(args)},
      'downloads',
    );
    await requestDownloadLocationUpdate(
      {invoke: async (...args: unknown[]) => void calls.push(args)},
      {error: (...args: unknown[]) => void errors.push(args)},
      undefined,
    );

    assert.deepStrictEqual(calls, [
      [DOWNLOAD_LOCATION_UPDATE_CHANNEL, {downloadPath: 'downloads'}],
      [DOWNLOAD_LOCATION_UPDATE_CHANNEL, {downloadPath: undefined}],
    ]);
    assert.deepStrictEqual(errors, []);
  });

  it('[security-target][INV-002][INV-010][SEC-003] contains renderer request failures', async () => {
    const errors: unknown[][] = [];
    const logger = {error: (...args: unknown[]) => void errors.push(args)};

    await requestDownloadLocationUpdate({invoke: async () => Promise.reject(new Error('denied'))}, logger, 'downloads');
    await requestDownloadLocationUpdate({invoke: async () => ({ok: true})}, logger, 'downloads');

    assert.strictEqual(errors.length, 2);
    assert.strictEqual(errors[0][0], 'Failed to update the download location.');
    assert.match(String(errors[1][1]), /response payload is invalid/);
  });

  it('[characterization][security-target][INV-003][SEC-003][CAP-005] preserves the requested setting value', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const updates: Array<string | undefined> = [];
    const dispose = bindDownloadLocationIpc(createIpc(handlers), registry, value => void updates.push(value));
    const handler = handlers.get(DOWNLOAD_LOCATION_UPDATE_CHANNEL);
    assert.ok(handler);

    assert.strictEqual(await handler(event, {downloadPath: 'downloads'}), undefined);
    assert.strictEqual(await handler(event, {downloadPath: undefined}), undefined);
    assert.deepStrictEqual(updates, ['downloads', undefined]);
    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects unauthorized and malformed requests before updating', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let updateCalls = 0;
    bindDownloadLocationIpc(createIpc(handlers), registry, () => void (updateCalls += 1));
    const handler = handlers.get(DOWNLOAD_LOCATION_UPDATE_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 162}};
    await assert.rejects(() => handler(unknownEvent, {downloadPath: 'downloads'}), /not authorized/);
    for (const request of [
      undefined,
      'downloads',
      {},
      {downloadPath: null},
      {downloadPath: 'downloads', extra: true},
      {downloadPath: 'x'.repeat(MAX_DOWNLOAD_LOCATION_LENGTH + 1)},
    ]) {
      await assert.rejects(() => handler(event, request), /payload/);
    }
    assert.strictEqual(updateCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] limits setting writes per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let updateCalls = 0;
    bindDownloadLocationIpc(createIpc(handlers), registry, () => void (updateCalls += 1));
    const handler = handlers.get(DOWNLOAD_LOCATION_UPDATE_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE; request += 1) {
      await handler(event, {downloadPath: 'downloads'});
    }
    await assert.rejects(() => handler(event, {downloadPath: 'downloads'}), /rate limit/);
    assert.strictEqual(updateCalls, MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE);
  });
});
