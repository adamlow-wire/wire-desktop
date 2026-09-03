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
  MAX_SSO_WINDOW_CONTROL_REQUESTS_PER_MINUTE,
  SSO_WINDOW_CLOSE_CAPABILITY,
  SSO_WINDOW_CLOSE_CHANNEL,
  SSO_WINDOW_FOCUS_CAPABILITY,
  SSO_WINDOW_FOCUS_CHANNEL,
} from './SsoWindowControlContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  MAX_SSO_WINDOW_CONTROL_REQUESTS_PER_MINUTE,
  SSO_WINDOW_CLOSE_CAPABILITY,
  SSO_WINDOW_CLOSE_CHANNEL,
  SSO_WINDOW_FOCUS_CAPABILITY,
  SSO_WINDOW_FOCUS_CHANNEL,
} from './SsoWindowControlContract';

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

export interface SsoWindowControlBoundary {
  close(accountId: string | undefined): void;
  focus(accountId: string | undefined): void;
}

const createContract = (channel: string, capability: string): AuthorizedIpcContract<undefined, void> =>
  Object.freeze({
    capability,
    channel,
    failureMode: 'reject',
    isRequest: (value: unknown): value is undefined => typeof value === 'undefined',
    isResponse: (value: unknown): value is void => typeof value === 'undefined',
    originPolicy: 'registered-view-origin',
    rateLimit: Object.freeze({maxRequests: MAX_SSO_WINDOW_CONTROL_REQUESTS_PER_MINUTE, windowMs: 60_000}),
    viewTypes: Object.freeze(['account'] as const),
  });

const closeContract = createContract(SSO_WINDOW_CLOSE_CHANNEL, SSO_WINDOW_CLOSE_CAPABILITY);
const focusContract = createContract(SSO_WINDOW_FOCUS_CHANNEL, SSO_WINDOW_FOCUS_CAPABILITY);

const requestControl = async (
  ipc: IpcRendererInvoker,
  logger: FailureLogger,
  channel: string,
  failureMessage: string,
): Promise<void> => {
  try {
    const response = await ipc.invoke(channel);
    if (typeof response !== 'undefined') {
      throw new Error('SSO window control response payload is invalid.');
    }
  } catch (error) {
    logger.error(failureMessage, error);
  }
};

export const requestSsoWindowClose = (ipc: IpcRendererInvoker, logger: FailureLogger): Promise<void> =>
  requestControl(ipc, logger, SSO_WINDOW_CLOSE_CHANNEL, 'Failed to close the SSO window.');

export const requestSsoWindowFocus = (ipc: IpcRendererInvoker, logger: FailureLogger): Promise<void> =>
  requestControl(ipc, logger, SSO_WINDOW_FOCUS_CHANNEL, 'Failed to focus the SSO window.');

export const bindSsoWindowControlIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  boundary: SsoWindowControlBoundary,
): (() => void) => {
  const disposeClose = bindAuthorizedIpc(ipc, registry, closeContract, identity => boundary.close(identity.accountId));
  const disposeFocus = bindAuthorizedIpc(ipc, registry, focusContract, identity => boundary.focus(identity.accountId));
  return () => {
    disposeClose();
    disposeFocus();
  };
};
