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
import {isRuntimeInfoRequest} from './policy';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export const authorizeRuntimeInfoRequest = (
  registry: ViewIdentityRegistry,
  event: SenderIdentity,
  request: unknown,
): Readonly<{accountId: string; contractVersion: typeof SECURE_SHELL_CONTRACT_VERSION}> => {
  const identity = registry.authorize(event, SECURE_SHELL_RUNTIME_INFO_CAPABILITY);

  if (!isRuntimeInfoRequest(request)) {
    throw new Error('Secure shell request payload is invalid.');
  }

  return Object.freeze({
    accountId: identity.accountId,
    contractVersion: SECURE_SHELL_CONTRACT_VERSION,
  });
};

export const bindSecureShellIpc = (registry: ViewIdentityRegistry): (() => void) => {
  ipcMain.handle(SECURE_SHELL_RUNTIME_INFO_CHANNEL, (event, request: unknown) => {
    return authorizeRuntimeInfoRequest(registry, event, request);
  });

  return () => ipcMain.removeHandler(SECURE_SHELL_RUNTIME_INFO_CHANNEL);
};
