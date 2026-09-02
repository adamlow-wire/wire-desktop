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
  MAX_SAVE_PICTURE_BYTES,
  SAVE_PICTURE_CAPABILITY,
  SAVE_PICTURE_CHANNEL,
  SavePictureRequest,
} from './SavePictureContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {MAX_SAVE_PICTURE_BYTES, SAVE_PICTURE_CAPABILITY, SAVE_PICTURE_CHANNEL} from './SavePictureContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

type SavePictureBoundary = (bytes: Uint8Array, timestamp?: string) => Promise<void>;

const SAVE_PICTURE_RATE_LIMIT = Object.freeze({maxRequests: 10, windowMs: 60_000});
const ALLOWED_REQUEST_KEYS = new Set(['bytes', 'timestamp']);

const isValidTimestamp = (value: unknown): value is string | undefined => {
  if (typeof value === 'undefined') {
    return true;
  }
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value)) {
    return false;
  }
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp <= 8_640_000_000_000_000;
};

const isSavePictureRequest = (value: unknown): value is SavePictureRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<SavePictureRequest>;
  const keys = Object.keys(value);
  return (
    keys.every(key => ALLOWED_REQUEST_KEYS.has(key)) &&
    Object.prototype.hasOwnProperty.call(value, 'bytes') &&
    request.bytes instanceof Uint8Array &&
    request.bytes.byteLength > 0 &&
    request.bytes.byteLength <= MAX_SAVE_PICTURE_BYTES &&
    isValidTimestamp(request.timestamp)
  );
};

const savePictureContract: AuthorizedIpcContract<SavePictureRequest, void> = Object.freeze({
  capability: SAVE_PICTURE_CAPABILITY,
  channel: SAVE_PICTURE_CHANNEL,
  failureMode: 'reject',
  isRequest: isSavePictureRequest,
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: SAVE_PICTURE_RATE_LIMIT,
  viewTypes: Object.freeze(['account'] as const),
});

export const bindSavePictureIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  savePicture: SavePictureBoundary,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, savePictureContract, (_identity, request) =>
    savePicture(request.bytes, request.timestamp),
  );
