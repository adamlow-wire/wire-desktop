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
  bindSafeStorageIpc,
  MAX_SAFE_STORAGE_CIPHERTEXT_BYTES,
  MAX_SAFE_STORAGE_PLAINTEXT_BYTES,
  SAFE_STORAGE_DECRYPT_CAPABILITY,
  SAFE_STORAGE_DECRYPT_CHANNEL,
  SAFE_STORAGE_ENCRYPT_CAPABILITY,
  SAFE_STORAGE_ENCRYPT_CHANNEL,
} from './SafeStorageIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const createSender = (registry: ViewIdentityRegistry) => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id: 71, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [SAFE_STORAGE_ENCRYPT_CAPABILITY, SAFE_STORAGE_DECRYPT_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame} as SenderIdentity;
};

describe('safe storage IPC contracts', () => {
  it('[characterization][security-target][INV-003][SEC-003][DCP-016] preserves string and byte conversion', async () => {
    const handlers = new Map<string, BoundHandler>();
    const ipc = {
      handle: (channel: string, handler: BoundHandler) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    };
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let decryptedBuffer: Buffer | undefined;
    const dispose = bindSafeStorageIpc(ipc, registry, {
      decryptString: encrypted => {
        decryptedBuffer = encrypted;
        return 'decrypted-value';
      },
      encryptString: plaintext => {
        assert.strictEqual(plaintext, 'plaintext-value');
        return Buffer.from([1, 2, 3]);
      },
    });

    assert.deepStrictEqual(
      await handlers.get(SAFE_STORAGE_ENCRYPT_CHANNEL)?.(event, 'plaintext-value'),
      Buffer.from([1, 2, 3]),
    );
    assert.strictEqual(
      await handlers.get(SAFE_STORAGE_DECRYPT_CHANNEL)?.(event, new Uint8Array([4, 5, 6])),
      'decrypted-value',
    );
    assert.strictEqual(Buffer.isBuffer(decryptedBuffer), true);
    assert.deepStrictEqual(decryptedBuffer, Buffer.from([4, 5, 6]));

    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-016] rejects unauthorized and invalid payloads', async () => {
    const handlers = new Map<string, BoundHandler>();
    const ipc = {
      handle: (channel: string, handler: BoundHandler) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    };
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let decryptResponse = 'value';
    let encryptResponse = Buffer.from([1]);
    const storage = {
      decryptString: () => decryptResponse,
      encryptString: () => encryptResponse,
    };
    bindSafeStorageIpc(ipc, registry, storage);
    const encrypt = handlers.get(SAFE_STORAGE_ENCRYPT_CHANNEL);
    const decrypt = handlers.get(SAFE_STORAGE_DECRYPT_CHANNEL);
    assert.ok(encrypt);
    assert.ok(decrypt);

    const unknownEvent = {...event, sender: {...event.sender, id: 72}};
    await assert.rejects(() => encrypt(unknownEvent, 'value'), /not authorized/);
    await assert.rejects(() => decrypt(unknownEvent, new Uint8Array([1])), /not authorized/);
    await assert.rejects(() => encrypt(event, 42), /payload/);
    await assert.rejects(() => encrypt(event, 'x'.repeat(MAX_SAFE_STORAGE_PLAINTEXT_BYTES + 1)), /payload/);
    await assert.rejects(() => decrypt(event, []), /payload/);
    await assert.rejects(() => decrypt(event, new Uint8Array(MAX_SAFE_STORAGE_CIPHERTEXT_BYTES + 1)), /payload/);

    encryptResponse = Buffer.alloc(MAX_SAFE_STORAGE_CIPHERTEXT_BYTES + 1);
    await assert.rejects(() => encrypt(event, 'value'), /response/);
    decryptResponse = 'x'.repeat(MAX_SAFE_STORAGE_PLAINTEXT_BYTES + 1);
    await assert.rejects(() => decrypt(event, new Uint8Array([1])), /response/);
  });

  it('[security-target][INV-003][INV-010][SEC-003][DCP-016] rate-limits both crypto operations per view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const ipc = {
      handle: (channel: string, handler: BoundHandler) => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string) => {
        handlers.delete(channel);
      },
    };
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    bindSafeStorageIpc(ipc, registry, {
      decryptString: () => 'value',
      encryptString: () => Buffer.from([1]),
    });
    const encrypt = handlers.get(SAFE_STORAGE_ENCRYPT_CHANNEL);
    const decrypt = handlers.get(SAFE_STORAGE_DECRYPT_CHANNEL);
    assert.ok(encrypt);
    assert.ok(decrypt);

    for (let request = 0; request < 120; request += 1) {
      await encrypt(event, 'value');
      await decrypt(event, new Uint8Array([1]));
    }
    await assert.rejects(() => encrypt(event, 'value'), /rate limit/);
    await assert.rejects(() => decrypt(event, new Uint8Array([1])), /rate limit/);
  });
});
