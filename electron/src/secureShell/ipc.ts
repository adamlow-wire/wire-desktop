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

import {ipcMain} from 'electron';

import {
  SECURE_SHELL_CONTRACT_VERSION,
  SECURE_SHELL_RUNTIME_INFO_CAPABILITY,
  SECURE_SHELL_RUNTIME_INFO_CHANNEL,
} from './constants';
import {isRuntimeInfoRequest, RuntimeInfoRequest} from './policy';

import {AuthorizedIpcContract, bindAuthorizedIpc, executeAuthorizedIpc} from '../security/AuthorizedIpc';
import {AuthorizedViewIdentity, SenderIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

type RuntimeInfoResponse = Readonly<{
  accountId: string;
  contractVersion: typeof SECURE_SHELL_CONTRACT_VERSION;
}>;

export const isRuntimeInfoResponse = (value: unknown): value is RuntimeInfoResponse => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.accountId === 'string' &&
    record.contractVersion === SECURE_SHELL_CONTRACT_VERSION
  );
};

const runtimeInfoContract: AuthorizedIpcContract<RuntimeInfoRequest, RuntimeInfoResponse> = Object.freeze({
  capability: SECURE_SHELL_RUNTIME_INFO_CAPABILITY,
  channel: SECURE_SHELL_RUNTIME_INFO_CHANNEL,
  failureMode: 'reject',
  isRequest: isRuntimeInfoRequest,
  isResponse: isRuntimeInfoResponse,
  originPolicy: 'registered-view-origin',
  viewTypes: Object.freeze(['account'] as const),
});

const createRuntimeInfoResponse = (identity: AuthorizedViewIdentity): RuntimeInfoResponse => {
  if (!identity.accountId) {
    throw new Error('Secure shell account identity is invalid.');
  }
  return Object.freeze({
    accountId: identity.accountId,
    contractVersion: SECURE_SHELL_CONTRACT_VERSION,
  });
};

export const authorizeRuntimeInfoRequest = (
  registry: ViewIdentityRegistry,
  event: SenderIdentity,
  request: unknown,
): Promise<RuntimeInfoResponse> =>
  executeAuthorizedIpc(registry, runtimeInfoContract, event, request, createRuntimeInfoResponse);

export const bindSecureShellIpc = (registry: ViewIdentityRegistry): (() => void) =>
  bindAuthorizedIpc(ipcMain, registry, runtimeInfoContract, createRuntimeInfoResponse);
