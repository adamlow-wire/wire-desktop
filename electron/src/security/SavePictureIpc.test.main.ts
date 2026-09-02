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
  bindSavePictureIpc,
  MAX_SAVE_PICTURE_BYTES,
  SAVE_PICTURE_CAPABILITY,
  SAVE_PICTURE_CHANNEL,
} from './SavePictureIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry, id = 91): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [SAVE_PICTURE_CAPABILITY],
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

describe('save-picture IPC contract', () => {
  it('[characterization][security-target][INV-003][SEC-003] preserves image bytes and optional timestamp', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const calls: Array<{bytes: Uint8Array; timestamp?: string}> = [];
    const dispose = bindSavePictureIpc(createIpc(handlers), registry, async (bytes, timestamp) => {
      calls.push({bytes, timestamp});
    });
    const handler = handlers.get(SAVE_PICTURE_CHANNEL);
    assert.ok(handler);

    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
    assert.strictEqual(await handler(event, {bytes, timestamp: '1588599720000'}), undefined);
    assert.deepStrictEqual(calls, [{bytes, timestamp: '1588599720000'}]);

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects unauthorized and malformed requests before opening a dialog', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let saveCalls = 0;
    bindSavePictureIpc(createIpc(handlers), registry, async () => {
      saveCalls += 1;
    });
    const handler = handlers.get(SAVE_PICTURE_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 92}};
    const validBytes = Uint8Array.from([1]);
    await assert.rejects(() => handler(unknownEvent, {bytes: validBytes}), /not authorized/);
    await assert.rejects(() => handler(event, undefined), /payload/);
    await assert.rejects(() => handler(event, {bytes: []}), /payload/);
    await assert.rejects(() => handler(event, {bytes: new Uint8Array()}), /payload/);
    await assert.rejects(() => handler(event, {bytes: new Uint8Array(MAX_SAVE_PICTURE_BYTES + 1)}), /payload/);
    await assert.rejects(() => handler(event, {bytes: validBytes, timestamp: 'not-a-timestamp'}), /payload/);
    await assert.rejects(() => handler(event, {bytes: validBytes, timestamp: '9007199254740991'}), /payload/);
    await assert.rejects(() => handler(event, {bytes: validBytes, rendererChosenPath: '/tmp/image'}), /payload/);
    assert.strictEqual(saveCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] limits native save prompts per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let saveCalls = 0;
    bindSavePictureIpc(createIpc(handlers), registry, async () => {
      saveCalls += 1;
    });
    const handler = handlers.get(SAVE_PICTURE_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < 10; request += 1) {
      await handler(event, {bytes: Uint8Array.from([request])});
    }
    await assert.rejects(() => handler(event, {bytes: Uint8Array.from([11])}), /rate limit/);
    assert.strictEqual(saveCalls, 10);
  });
});
