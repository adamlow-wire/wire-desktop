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
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';
import {
  MAX_WRAPPER_RELOAD_REQUESTS_PER_MINUTE,
  WRAPPER_RELOAD_CAPABILITY,
  WRAPPER_RELOAD_REQUEST_CHANNEL,
} from './WrapperReloadContract';

export {
  MAX_WRAPPER_RELOAD_REQUESTS_PER_MINUTE,
  WRAPPER_RELOAD_CAPABILITY,
  WRAPPER_RELOAD_REQUEST_CHANNEL,
} from './WrapperReloadContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string): Promise<unknown>;
}

interface FailureLogger {
  error(message: string, error: unknown): void;
}

type ReloadBoundary = () => void;

const wrapperReloadContract: AuthorizedIpcContract<undefined, void> = Object.freeze({
  capability: WRAPPER_RELOAD_CAPABILITY,
  channel: WRAPPER_RELOAD_REQUEST_CHANNEL,
  failureMode: 'reject',
  isRequest: (value: unknown): value is undefined => typeof value === 'undefined',
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_WRAPPER_RELOAD_REQUESTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

export const requestWrapperReload = async (ipc: IpcRendererInvoker, logger: FailureLogger): Promise<void> => {
  try {
    await ipc.invoke(WRAPPER_RELOAD_REQUEST_CHANNEL);
  } catch (error) {
    logger.error('Failed to request an application reload.', error);
  }
};

export const bindWrapperReloadIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  reload: ReloadBoundary,
): (() => void) => bindAuthorizedIpc(ipc, registry, wrapperReloadContract, () => reload());
