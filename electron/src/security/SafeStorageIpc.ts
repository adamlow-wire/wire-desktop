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

import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {
  MAX_SAFE_STORAGE_CIPHERTEXT_BYTES,
  MAX_SAFE_STORAGE_PLAINTEXT_BYTES,
  SAFE_STORAGE_DECRYPT_CAPABILITY,
  SAFE_STORAGE_DECRYPT_CHANNEL,
  SAFE_STORAGE_ENCRYPT_CAPABILITY,
  SAFE_STORAGE_ENCRYPT_CHANNEL,
} from './SafeStorageContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  MAX_SAFE_STORAGE_CIPHERTEXT_BYTES,
  MAX_SAFE_STORAGE_PLAINTEXT_BYTES,
  SAFE_STORAGE_DECRYPT_CAPABILITY,
  SAFE_STORAGE_DECRYPT_CHANNEL,
  SAFE_STORAGE_ENCRYPT_CAPABILITY,
  SAFE_STORAGE_ENCRYPT_CHANNEL,
} from './SafeStorageContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface SafeStorageBoundary {
  decryptString(encrypted: Buffer): string;
  encryptString(plaintext: string): Buffer;
}

const CRYPTO_RATE_LIMIT = Object.freeze({maxRequests: 120, windowMs: 60_000});

const isBoundedPlaintext = (value: unknown): value is string =>
  typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_SAFE_STORAGE_PLAINTEXT_BYTES;

const isBoundedCiphertext = (value: unknown): value is Uint8Array =>
  value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= MAX_SAFE_STORAGE_CIPHERTEXT_BYTES;

const encryptContract: AuthorizedIpcContract<string, Uint8Array> = Object.freeze({
  capability: SAFE_STORAGE_ENCRYPT_CAPABILITY,
  channel: SAFE_STORAGE_ENCRYPT_CHANNEL,
  failureMode: 'reject',
  isRequest: isBoundedPlaintext,
  isResponse: isBoundedCiphertext,
  originPolicy: 'registered-view-origin',
  rateLimit: CRYPTO_RATE_LIMIT,
  viewTypes: Object.freeze(['account'] as const),
});

const decryptContract: AuthorizedIpcContract<Uint8Array, string> = Object.freeze({
  capability: SAFE_STORAGE_DECRYPT_CAPABILITY,
  channel: SAFE_STORAGE_DECRYPT_CHANNEL,
  failureMode: 'reject',
  isRequest: isBoundedCiphertext,
  isResponse: isBoundedPlaintext,
  originPolicy: 'registered-view-origin',
  rateLimit: CRYPTO_RATE_LIMIT,
  viewTypes: Object.freeze(['account'] as const),
});

export const bindSafeStorageIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  storage: SafeStorageBoundary,
): (() => void) => {
  const disposeEncrypt = bindAuthorizedIpc(ipc, registry, encryptContract, (_identity, plaintext) =>
    storage.encryptString(plaintext),
  );
  const disposeDecrypt = bindAuthorizedIpc(ipc, registry, decryptContract, (_identity, encrypted) =>
    storage.decryptString(Buffer.from(encrypted)),
  );
  return () => {
    disposeDecrypt();
    disposeEncrypt();
  };
};
