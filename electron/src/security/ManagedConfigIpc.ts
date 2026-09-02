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

import {AuthorizedIpcContract, bindAuthorizedSyncIpc} from './AuthorizedIpc';
import {MANAGED_CONFIG_CAPABILITY, MANAGED_CONFIG_CHANNEL} from './ManagedConfigContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

import type {ManagedConfig} from '../managed/ManagedConfig';

export {MANAGED_CONFIG_CAPABILITY, MANAGED_CONFIG_CHANNEL} from './ManagedConfigContract';

interface SyncSenderIdentity extends SenderIdentity {
  returnValue?: unknown;
}

interface IpcMainSyncBinding {
  on(channel: string, listener: (event: SyncSenderIdentity, request: unknown) => void): void;
  removeListener(channel: string, listener: (event: SyncSenderIdentity, request: unknown) => void): void;
}

const isManagedConfig = (value: unknown): value is ManagedConfig =>
  Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 1 &&
      typeof (value as {applockOverride?: unknown}).applockOverride === 'boolean',
  );

const contract: AuthorizedIpcContract<undefined, ManagedConfig> = Object.freeze({
  capability: MANAGED_CONFIG_CAPABILITY,
  channel: MANAGED_CONFIG_CHANNEL,
  failureMode: 'reject',
  isRequest: (value: unknown): value is undefined => value === undefined,
  isResponse: isManagedConfig,
  originPolicy: 'registered-view-origin',
  rateLimit: 'not-required',
  viewTypes: Object.freeze(['account'] as const),
});

export const bindManagedConfigIpc = (
  ipc: IpcMainSyncBinding,
  registry: ViewIdentityRegistry,
  getConfig: () => unknown,
): (() => void) =>
  bindAuthorizedSyncIpc(ipc, registry, contract, () => {
    const config = getConfig();
    if (!isManagedConfig(config)) {
      return config as ManagedConfig;
    }
    return Object.freeze({applockOverride: config.applockOverride});
  });
