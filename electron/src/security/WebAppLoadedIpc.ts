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
  MAX_WEBAPP_LOADED_EVENTS_PER_MINUTE,
  WEBAPP_LOADED_CAPABILITY,
  WEBAPP_LOADED_CHANNEL,
} from './WebAppLoadedContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  MAX_WEBAPP_LOADED_EVENTS_PER_MINUTE,
  WEBAPP_LOADED_CAPABILITY,
  WEBAPP_LOADED_CHANNEL,
} from './WebAppLoadedContract';

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

type FlushActionsBoundary = () => void;

const webAppLoadedContract: AuthorizedIpcContract<undefined, void> = Object.freeze({
  capability: WEBAPP_LOADED_CAPABILITY,
  channel: WEBAPP_LOADED_CHANNEL,
  failureMode: 'reject',
  isRequest: (value: unknown): value is undefined => typeof value === 'undefined',
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_WEBAPP_LOADED_EVENTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

export const notifyWebAppLoaded = async (ipc: IpcRendererInvoker, logger: FailureLogger): Promise<void> => {
  try {
    await ipc.invoke(WEBAPP_LOADED_CHANNEL);
  } catch (error) {
    logger.error('Failed to report that the webapp loaded.', error);
  }
};

export const handleWebAppLoaded = (
  ipc: IpcRendererInvoker,
  logger: FailureLogger,
  checkTheme: () => void,
): void => {
  void notifyWebAppLoaded(ipc, logger);
  checkTheme();
};

export const bindWebAppLoadedIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  flushActions: FlushActionsBoundary,
): (() => void) => bindAuthorizedIpc(ipc, registry, webAppLoadedContract, () => flushActions());
