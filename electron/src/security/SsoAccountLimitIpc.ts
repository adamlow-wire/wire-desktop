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
  MAX_SSO_ACCOUNT_LIMIT_WARNINGS_PER_MINUTE,
  SSO_ACCOUNT_LIMIT_CAPABILITY,
  SSO_ACCOUNT_LIMIT_CHANNEL,
} from './SsoAccountLimitContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  MAX_SSO_ACCOUNT_LIMIT_WARNINGS_PER_MINUTE,
  SSO_ACCOUNT_LIMIT_CAPABILITY,
  SSO_ACCOUNT_LIMIT_CHANNEL,
} from './SsoAccountLimitContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string): Promise<unknown>;
}

const contract: AuthorizedIpcContract<undefined, void> = Object.freeze({
  capability: SSO_ACCOUNT_LIMIT_CAPABILITY,
  channel: SSO_ACCOUNT_LIMIT_CHANNEL,
  failureMode: 'reject',
  isRequest: (value: unknown): value is undefined => typeof value === 'undefined',
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_SSO_ACCOUNT_LIMIT_WARNINGS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['application-shell'] as const),
});

export const requestSsoAccountLimitWarning = async (ipc: IpcRendererInvoker): Promise<void> => {
  await ipc.invoke(SSO_ACCOUNT_LIMIT_CHANNEL);
};

export const bindSsoAccountLimitIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  showWarning: () => Promise<void>,
): (() => void) => bindAuthorizedIpc(ipc, registry, contract, showWarning);
