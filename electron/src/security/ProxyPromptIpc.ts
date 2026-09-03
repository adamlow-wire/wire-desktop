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
  MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE,
  MAX_PROXY_PROMPT_LOCALE_LABEL_LENGTH,
  MAX_PROXY_PROMPT_LOCALE_LABELS,
  MAX_PROXY_PROMPT_LOCALE_REQUESTS_PER_MINUTE,
  MAX_PROXY_PROMPT_LOCALE_VALUE_LENGTH,
  MAX_PROXY_PROMPT_PASSWORD_LENGTH,
  MAX_PROXY_PROMPT_USERNAME_LENGTH,
  PROXY_PROMPT_CANCEL_CAPABILITY,
  PROXY_PROMPT_CANCEL_CHANNEL,
  ProxyPromptCredentials,
  PROXY_PROMPT_LOCALE_READ_CAPABILITY,
  PROXY_PROMPT_LOCALE_READ_CHANNEL,
  ProxyPromptLocaleRequest,
  ProxyPromptLocaleResponse,
  PROXY_PROMPT_SUBMIT_CAPABILITY,
  PROXY_PROMPT_SUBMIT_CHANNEL,
} from './ProxyPromptContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE,
  MAX_PROXY_PROMPT_LOCALE_LABEL_LENGTH,
  MAX_PROXY_PROMPT_LOCALE_LABELS,
  MAX_PROXY_PROMPT_LOCALE_REQUESTS_PER_MINUTE,
  MAX_PROXY_PROMPT_LOCALE_VALUE_LENGTH,
  MAX_PROXY_PROMPT_PASSWORD_LENGTH,
  MAX_PROXY_PROMPT_USERNAME_LENGTH,
  PROXY_PROMPT_CANCEL_CAPABILITY,
  PROXY_PROMPT_CANCEL_CHANNEL,
  PROXY_PROMPT_LOCALE_READ_CAPABILITY,
  PROXY_PROMPT_LOCALE_READ_CHANNEL,
  PROXY_PROMPT_SUBMIT_CAPABILITY,
  PROXY_PROMPT_SUBMIT_CHANNEL,
} from './ProxyPromptContract';
export type {ProxyPromptCredentials, ProxyPromptLocaleRequest, ProxyPromptLocaleResponse} from './ProxyPromptContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request?: unknown): Promise<unknown>;
}

interface FailureLogger {
  error(message: string, error: unknown): void;
}

export interface ProxyPromptBoundary {
  cancel(webContentsId: number): void | Promise<void>;
  readLocaleValues(labels: readonly string[]): ProxyPromptLocaleResponse;
  submit(webContentsId: number, credentials: ProxyPromptCredentials): void | Promise<void>;
}

interface ProxyPromptCoordinatorBoundary {
  cancel(webContentsId: number): Promise<void>;
  submit(webContentsId: number, credentials: ProxyPromptCredentials): Promise<void>;
}

export const createProxyPromptBoundary = (
  coordinator: ProxyPromptCoordinatorBoundary,
  readLocaleValue: (label: string) => string,
): ProxyPromptBoundary => ({
  cancel: webContentsId => coordinator.cancel(webContentsId),
  readLocaleValues: labels => Object.fromEntries(labels.map(label => [label, readLocaleValue(label)])),
  submit: (webContentsId, credentials) => coordinator.submit(webContentsId, credentials),
});

const LOCALE_REQUEST_KEYS = new Set(['labels']);
const CREDENTIAL_KEYS = new Set(['password', 'username']);
const LOCALE_LABEL_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

const isBoundedString = (value: unknown, maximumLength: number, allowEmpty = false): value is string =>
  typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= maximumLength;

export const isProxyPromptLocaleRequest = (value: unknown): value is ProxyPromptLocaleRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<ProxyPromptLocaleRequest>;
  const keys = Object.keys(value);
  return (
    keys.length === LOCALE_REQUEST_KEYS.size &&
    keys.every(key => LOCALE_REQUEST_KEYS.has(key)) &&
    Array.isArray(request.labels) &&
    request.labels.length <= MAX_PROXY_PROMPT_LOCALE_LABELS &&
    request.labels.every(
      label => isBoundedString(label, MAX_PROXY_PROMPT_LOCALE_LABEL_LENGTH) && LOCALE_LABEL_PATTERN.test(label),
    ) &&
    new Set(request.labels).size === request.labels.length
  );
};

export const isProxyPromptLocaleResponse = (value: unknown): value is ProxyPromptLocaleResponse =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length <= MAX_PROXY_PROMPT_LOCALE_LABELS &&
  Object.entries(value).every(
    ([key, entry]) =>
      key.length <= MAX_PROXY_PROMPT_LOCALE_LABEL_LENGTH &&
      LOCALE_LABEL_PATTERN.test(key) &&
      isBoundedString(entry, MAX_PROXY_PROMPT_LOCALE_VALUE_LENGTH, true),
  );

export const isProxyPromptCredentials = (value: unknown): value is ProxyPromptCredentials => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const credentials = value as Partial<ProxyPromptCredentials>;
  const keys = Object.keys(value);
  return (
    keys.length === CREDENTIAL_KEYS.size &&
    keys.every(key => CREDENTIAL_KEYS.has(key)) &&
    isBoundedString(credentials.username, MAX_PROXY_PROMPT_USERNAME_LENGTH, true) &&
    isBoundedString(credentials.password, MAX_PROXY_PROMPT_PASSWORD_LENGTH, true)
  );
};

const localeContract: AuthorizedIpcContract<ProxyPromptLocaleRequest, ProxyPromptLocaleResponse> = Object.freeze({
  capability: PROXY_PROMPT_LOCALE_READ_CAPABILITY,
  channel: PROXY_PROMPT_LOCALE_READ_CHANNEL,
  failureMode: 'reject',
  isRequest: isProxyPromptLocaleRequest,
  isResponse: isProxyPromptLocaleResponse,
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_PROXY_PROMPT_LOCALE_REQUESTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['proxy-prompt'] as const),
});

const createControlContract = <Request>(
  capability: string,
  channel: string,
  isRequest: (value: unknown) => value is Request,
): AuthorizedIpcContract<Request, void> =>
  Object.freeze({
    capability,
    channel,
    failureMode: 'reject',
    isRequest,
    isResponse: (value: unknown): value is void => typeof value === 'undefined',
    originPolicy: 'registered-view-origin',
    rateLimit: Object.freeze({maxRequests: MAX_PROXY_PROMPT_CONTROL_REQUESTS_PER_MINUTE, windowMs: 60_000}),
    viewTypes: Object.freeze(['proxy-prompt'] as const),
  });

const submitContract = createControlContract(
  PROXY_PROMPT_SUBMIT_CAPABILITY,
  PROXY_PROMPT_SUBMIT_CHANNEL,
  isProxyPromptCredentials,
);
const cancelContract = createControlContract<undefined>(
  PROXY_PROMPT_CANCEL_CAPABILITY,
  PROXY_PROMPT_CANCEL_CHANNEL,
  (value: unknown): value is undefined => typeof value === 'undefined',
);

const hasExactLocaleResponse = (response: ProxyPromptLocaleResponse, labels: readonly string[]): boolean => {
  const expectedKeys = new Set(labels);
  const responseKeys = Object.keys(response);
  return responseKeys.length === expectedKeys.size && responseKeys.every(key => expectedKeys.has(key));
};

export const requestProxyPromptLocaleValues = async (
  ipc: IpcRendererInvoker,
  labels: readonly string[],
  logger: FailureLogger,
): Promise<ProxyPromptLocaleResponse | undefined> => {
  try {
    const response = await ipc.invoke(PROXY_PROMPT_LOCALE_READ_CHANNEL, {labels});
    if (!isProxyPromptLocaleResponse(response) || !hasExactLocaleResponse(response, labels)) {
      throw new Error('Proxy prompt locale response payload is invalid.');
    }
    return response;
  } catch (error) {
    logger.error('Failed to read proxy prompt locale values.', error);
    return undefined;
  }
};

const invokeControl = async (
  ipc: IpcRendererInvoker,
  logger: FailureLogger,
  channel: string,
  request: unknown,
  failureMessage: string,
): Promise<boolean> => {
  try {
    const response = await ipc.invoke(channel, request);
    if (typeof response !== 'undefined') {
      throw new Error('Proxy prompt control response payload is invalid.');
    }
    return true;
  } catch (error) {
    logger.error(failureMessage, error);
    return false;
  }
};

export const submitProxyPrompt = (
  ipc: IpcRendererInvoker,
  credentials: ProxyPromptCredentials,
  logger: FailureLogger,
): Promise<boolean> =>
  invokeControl(ipc, logger, PROXY_PROMPT_SUBMIT_CHANNEL, credentials, 'Failed to submit proxy credentials.');

export const cancelProxyPrompt = (ipc: IpcRendererInvoker, logger: FailureLogger): Promise<boolean> =>
  invokeControl(ipc, logger, PROXY_PROMPT_CANCEL_CHANNEL, undefined, 'Failed to cancel the proxy prompt.');

export const bindProxyPromptIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  boundary: ProxyPromptBoundary,
): (() => void) => {
  const disposeLocale = bindAuthorizedIpc(ipc, registry, localeContract, (_identity, request) =>
    boundary.readLocaleValues(request.labels),
  );
  const disposeSubmit = bindAuthorizedIpc(ipc, registry, submitContract, (identity, credentials) =>
    boundary.submit(identity.webContents.id, credentials),
  );
  const disposeCancel = bindAuthorizedIpc(ipc, registry, cancelContract, identity =>
    boundary.cancel(identity.webContents.id),
  );
  return () => {
    disposeLocale();
    disposeSubmit();
    disposeCancel();
  };
};
