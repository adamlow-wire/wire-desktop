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

import {ValidationUtil} from '@wireapp/commons';

import {
  ACCOUNT_DATA_DELETE_CAPABILITY,
  ACCOUNT_DATA_DELETE_CHANNEL,
  AccountDataDeletionRequest,
  MAX_ACCOUNT_DELETIONS_PER_MINUTE,
} from './AccountDataDeletionContract';
import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  ACCOUNT_DATA_DELETE_CAPABILITY,
  ACCOUNT_DATA_DELETE_CHANNEL,
  MAX_ACCOUNT_DELETIONS_PER_MINUTE,
} from './AccountDataDeletionContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: AccountDataDeletionRequest): Promise<unknown>;
}

type AccountDeletionBoundary = (webContentsId: number, accountId: string, partitionId?: string) => Promise<void>;

const REQUIRED_REQUEST_KEYS = new Set(['accountId', 'webContentsId']);
const ALLOWED_REQUEST_KEYS = new Set([...REQUIRED_REQUEST_KEYS, 'partitionId']);

const isAccountDataDeletionRequest = (value: unknown): value is AccountDataDeletionRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<AccountDataDeletionRequest>;
  const keys = Object.keys(value);
  return (
    keys.length >= REQUIRED_REQUEST_KEYS.size &&
    keys.length <= ALLOWED_REQUEST_KEYS.size &&
    [...REQUIRED_REQUEST_KEYS].every(key => keys.includes(key)) &&
    keys.every(key => ALLOWED_REQUEST_KEYS.has(key)) &&
    ValidationUtil.isUUIDv4(request.accountId ?? '') &&
    Number.isSafeInteger(request.webContentsId) &&
    request.webContentsId! > 0 &&
    (typeof request.partitionId === 'undefined' || ValidationUtil.isUUIDv4(request.partitionId))
  );
};

const accountDataDeletionContract: AuthorizedIpcContract<AccountDataDeletionRequest, void> = Object.freeze({
  capability: ACCOUNT_DATA_DELETE_CAPABILITY,
  channel: ACCOUNT_DATA_DELETE_CHANNEL,
  failureMode: 'reject',
  isRequest: isAccountDataDeletionRequest,
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_ACCOUNT_DELETIONS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['application-shell'] as const),
});

export const requestAccountDataDeletion = async (
  ipc: IpcRendererInvoker,
  request: AccountDataDeletionRequest,
): Promise<void> => {
  await ipc.invoke(ACCOUNT_DATA_DELETE_CHANNEL, request);
};

export const bindAccountDataDeletionIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  deleteAccount: AccountDeletionBoundary,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, accountDataDeletionContract, async (_identity, request) => {
    registry.authorizeAccountTarget(request.webContentsId, request.accountId, request.partitionId ?? 'default');
    await deleteAccount(request.webContentsId, request.accountId, request.partitionId);
  });
