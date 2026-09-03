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
  DEEP_LINK_SUBMIT_CAPABILITY,
  DEEP_LINK_SUBMIT_CHANNEL,
  DeepLinkSubmitRequest,
  MAX_DEEP_LINK_LENGTH,
  MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE,
} from './DeepLinkSubmitContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  DEEP_LINK_SUBMIT_CAPABILITY,
  DEEP_LINK_SUBMIT_CHANNEL,
  MAX_DEEP_LINK_LENGTH,
  MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE,
} from './DeepLinkSubmitContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: DeepLinkSubmitRequest): Promise<unknown>;
}

interface FailureLogger {
  error(message: string, error: unknown): void;
}

type DeepLinkBoundary = (url: string) => Promise<void>;

const isDeepLinkSubmitRequest = (value: unknown): value is DeepLinkSubmitRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<DeepLinkSubmitRequest>;
  return (
    Object.keys(value).length === 1 &&
    Object.prototype.hasOwnProperty.call(value, 'url') &&
    typeof request.url === 'string' &&
    request.url.length > 0 &&
    request.url.length <= MAX_DEEP_LINK_LENGTH
  );
};

const deepLinkSubmitContract: AuthorizedIpcContract<DeepLinkSubmitRequest, void> = Object.freeze({
  capability: DEEP_LINK_SUBMIT_CAPABILITY,
  channel: DEEP_LINK_SUBMIT_CHANNEL,
  failureMode: 'reject',
  isRequest: isDeepLinkSubmitRequest,
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['application-shell'] as const),
});

export const requestDeepLinkSubmission = async (
  ipc: IpcRendererInvoker,
  logger: FailureLogger,
  url: string,
): Promise<void> => {
  try {
    await ipc.invoke(DEEP_LINK_SUBMIT_CHANNEL, {url});
  } catch (error) {
    logger.error('Failed to submit the deep link.', error);
  }
};

export const bindDeepLinkSubmitIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  submit: DeepLinkBoundary,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, deepLinkSubmitContract, (_identity, request) => submit(request.url));
