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

import {
  ABOUT_LOCALE_READ_CAPABILITY,
  ABOUT_LOCALE_READ_CHANNEL,
  AboutLocaleRequest,
  AboutLocaleResponse,
  MAX_ABOUT_LOCALE_LABEL_LENGTH,
  MAX_ABOUT_LOCALE_LABELS,
  MAX_ABOUT_LOCALE_REQUESTS_PER_MINUTE,
  MAX_ABOUT_LOCALE_VALUE_LENGTH,
  MAX_WEBAPP_VERSION_LENGTH,
  MAX_WEBAPP_VERSION_REPORTS_PER_MINUTE,
  WEBAPP_VERSIONS_REPORT_CAPABILITY,
  WEBAPP_VERSIONS_REPORT_CHANNEL,
  WebappVersions,
} from './AboutWindowContract';
import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  ABOUT_LOCALE_READ_CAPABILITY,
  ABOUT_LOCALE_READ_CHANNEL,
  MAX_ABOUT_LOCALE_LABEL_LENGTH,
  MAX_ABOUT_LOCALE_LABELS,
  MAX_ABOUT_LOCALE_REQUESTS_PER_MINUTE,
  MAX_ABOUT_LOCALE_VALUE_LENGTH,
  MAX_WEBAPP_VERSION_LENGTH,
  MAX_WEBAPP_VERSION_REPORTS_PER_MINUTE,
  WEBAPP_VERSIONS_REPORT_CAPABILITY,
  WEBAPP_VERSIONS_REPORT_CHANNEL,
} from './AboutWindowContract';
export type {AboutLocaleRequest, AboutLocaleResponse, WebappVersions} from './AboutWindowContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: unknown): Promise<unknown>;
}

interface FailureLogger {
  error(message: string, error: unknown): void;
}

export interface AboutWindowBoundary {
  readLocaleValues(labels: readonly string[]): AboutLocaleResponse;
  reportWebappVersions(versions: WebappVersions): void;
}

const LOCALE_REQUEST_KEYS = new Set(['labels']);
const VERSION_REQUEST_KEYS = new Set(['webappAVSVersion', 'webappVersion']);
const LOCALE_RESPONSE_FIXED_KEYS = ['aboutReleasesUrl', 'aboutUpdatesUrl'] as const;
const LOCALE_LABEL_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

const isBoundedString = (value: unknown, maximumLength: number, allowEmpty = false): value is string =>
  typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= maximumLength;

export const isAboutLocaleRequest = (value: unknown): value is AboutLocaleRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<AboutLocaleRequest>;
  const keys = Object.keys(value);
  return (
    keys.length === LOCALE_REQUEST_KEYS.size &&
    keys.every(key => LOCALE_REQUEST_KEYS.has(key)) &&
    Array.isArray(request.labels) &&
    request.labels.length <= MAX_ABOUT_LOCALE_LABELS &&
    request.labels.every(
      label => isBoundedString(label, MAX_ABOUT_LOCALE_LABEL_LENGTH) && LOCALE_LABEL_PATTERN.test(label),
    ) &&
    new Set(request.labels).size === request.labels.length
  );
};

export const isAboutLocaleResponse = (value: unknown): value is AboutLocaleResponse =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  LOCALE_RESPONSE_FIXED_KEYS.every(key => Object.prototype.hasOwnProperty.call(value, key)) &&
  Object.keys(value).length <= MAX_ABOUT_LOCALE_LABELS + LOCALE_RESPONSE_FIXED_KEYS.length &&
  Object.entries(value).every(
    ([key, entry]) =>
      (LOCALE_RESPONSE_FIXED_KEYS.includes(key as (typeof LOCALE_RESPONSE_FIXED_KEYS)[number]) ||
        (key.length <= MAX_ABOUT_LOCALE_LABEL_LENGTH && LOCALE_LABEL_PATTERN.test(key))) &&
      isBoundedString(entry, MAX_ABOUT_LOCALE_VALUE_LENGTH, true),
  );

export const isWebappVersions = (value: unknown): value is WebappVersions => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const versions = value as Partial<WebappVersions>;
  const keys = Object.keys(value);
  return (
    keys.length >= 1 &&
    keys.length <= VERSION_REQUEST_KEYS.size &&
    keys.every(key => VERSION_REQUEST_KEYS.has(key)) &&
    isBoundedString(versions.webappVersion, MAX_WEBAPP_VERSION_LENGTH) &&
    (typeof versions.webappAVSVersion === 'undefined' ||
      isBoundedString(versions.webappAVSVersion, MAX_WEBAPP_VERSION_LENGTH))
  );
};

const localeContract: AuthorizedIpcContract<AboutLocaleRequest, AboutLocaleResponse> = Object.freeze({
  capability: ABOUT_LOCALE_READ_CAPABILITY,
  channel: ABOUT_LOCALE_READ_CHANNEL,
  failureMode: 'reject',
  isRequest: isAboutLocaleRequest,
  isResponse: isAboutLocaleResponse,
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_ABOUT_LOCALE_REQUESTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['about'] as const),
});

const versionsContract: AuthorizedIpcContract<WebappVersions, void> = Object.freeze({
  capability: WEBAPP_VERSIONS_REPORT_CAPABILITY,
  channel: WEBAPP_VERSIONS_REPORT_CHANNEL,
  failureMode: 'reject',
  isRequest: isWebappVersions,
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_WEBAPP_VERSION_REPORTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

const hasExactLocaleResponse = (response: AboutLocaleResponse, labels: readonly string[]): boolean => {
  const expectedKeys = new Set([...labels, ...LOCALE_RESPONSE_FIXED_KEYS]);
  const responseKeys = Object.keys(response);
  return responseKeys.length === expectedKeys.size && responseKeys.every(key => expectedKeys.has(key));
};

export const requestAboutLocaleValues = async (
  ipc: IpcRendererInvoker,
  labels: readonly string[],
  logger: FailureLogger,
): Promise<AboutLocaleResponse | undefined> => {
  try {
    const response = await ipc.invoke(ABOUT_LOCALE_READ_CHANNEL, {labels});
    if (!isAboutLocaleResponse(response) || !hasExactLocaleResponse(response, labels)) {
      throw new Error('About locale response payload is invalid.');
    }
    return response;
  } catch (error) {
    logger.error('Failed to read About window locale values.', error);
    return undefined;
  }
};

export const reportWebappVersions = async (
  ipc: IpcRendererInvoker,
  versions: WebappVersions,
  logger: FailureLogger,
): Promise<void> => {
  try {
    const response = await ipc.invoke(WEBAPP_VERSIONS_REPORT_CHANNEL, versions);
    if (typeof response !== 'undefined') {
      throw new Error('Webapp versions response payload is invalid.');
    }
  } catch (error) {
    logger.error('Failed to report webapp versions.', error);
  }
};

export const bindAboutWindowIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  boundary: AboutWindowBoundary,
): (() => void) => {
  const disposeLocale = bindAuthorizedIpc(ipc, registry, localeContract, (_identity, request) =>
    boundary.readLocaleValues(request.labels),
  );
  const disposeVersions = bindAuthorizedIpc(ipc, registry, versionsContract, (_identity, request) =>
    boundary.reportWebappVersions(request),
  );
  return () => {
    disposeLocale();
    disposeVersions();
  };
};
