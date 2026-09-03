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

import {DesktopCapturerSource} from 'electron';

import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {
  DESKTOP_SOURCES_ENUMERATE_CAPABILITY,
  DESKTOP_SOURCES_ENUMERATE_CHANNEL,
  DesktopSourcesRequest,
  MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE,
  MAX_DESKTOP_SOURCES,
  MAX_DESKTOP_SOURCE_THUMBNAIL_DIMENSION,
} from './DesktopSourcesContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  DESKTOP_SOURCES_ENUMERATE_CAPABILITY,
  DESKTOP_SOURCES_ENUMERATE_CHANNEL,
  MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE,
  MAX_DESKTOP_SOURCES,
  MAX_DESKTOP_SOURCE_THUMBNAIL_DIMENSION,
} from './DesktopSourcesContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: DesktopSourcesRequest): Promise<unknown>;
}

type DesktopSourcesBoundary = (options: DesktopSourcesRequest) => Promise<DesktopCapturerSource[]>;

const ALLOWED_REQUEST_KEYS = new Set(['fetchWindowIcons', 'thumbnailSize', 'types']);
const ALLOWED_SOURCE_TYPES = new Set(['screen', 'window']);
const MAX_SOURCE_ID_LENGTH = 512;
const MAX_SOURCE_NAME_LENGTH = 2_048;

const isBoundedInteger = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_DESKTOP_SOURCE_THUMBNAIL_DIMENSION;

const isDesktopSourcesRequest = (value: unknown): value is DesktopSourcesRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<DesktopSourcesRequest>;
  const keys = Object.keys(value);
  const types = request.types;
  const thumbnailSize = request.thumbnailSize;
  return (
    keys.length > 0 &&
    keys.every(key => ALLOWED_REQUEST_KEYS.has(key)) &&
    Array.isArray(types) &&
    types.length > 0 &&
    types.length <= ALLOWED_SOURCE_TYPES.size &&
    types.every(type => ALLOWED_SOURCE_TYPES.has(type)) &&
    new Set(types).size === types.length &&
    (typeof request.fetchWindowIcons === 'undefined' || typeof request.fetchWindowIcons === 'boolean') &&
    (typeof thumbnailSize === 'undefined' ||
      (thumbnailSize !== null &&
        typeof thumbnailSize === 'object' &&
        !Array.isArray(thumbnailSize) &&
        Object.keys(thumbnailSize).length === 2 &&
        Object.prototype.hasOwnProperty.call(thumbnailSize, 'height') &&
        Object.prototype.hasOwnProperty.call(thumbnailSize, 'width') &&
        isBoundedInteger(thumbnailSize.height) &&
        isBoundedInteger(thumbnailSize.width)))
  );
};

const isNativeImageLike = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && typeof (value as {toDataURL?: unknown}).toDataURL === 'function';

const isDesktopSource = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const source = value as Partial<DesktopCapturerSource>;
  return (
    typeof source.id === 'string' &&
    source.id.length > 0 &&
    source.id.length <= MAX_SOURCE_ID_LENGTH &&
    typeof source.name === 'string' &&
    source.name.length <= MAX_SOURCE_NAME_LENGTH &&
    typeof source.display_id === 'string' &&
    source.display_id.length <= MAX_SOURCE_ID_LENGTH &&
    isNativeImageLike(source.thumbnail) &&
    (source.appIcon === null || isNativeImageLike(source.appIcon))
  );
};

export const isDesktopSourcesResponse = (value: unknown): value is DesktopCapturerSource[] =>
  Array.isArray(value) && value.length <= MAX_DESKTOP_SOURCES && value.every(isDesktopSource);

const desktopSourcesContract: AuthorizedIpcContract<DesktopSourcesRequest, DesktopCapturerSource[]> = Object.freeze({
  capability: DESKTOP_SOURCES_ENUMERATE_CAPABILITY,
  channel: DESKTOP_SOURCES_ENUMERATE_CHANNEL,
  failureMode: 'reject',
  isRequest: isDesktopSourcesRequest,
  isResponse: isDesktopSourcesResponse,
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

export const requestDesktopSources = async (
  ipc: IpcRendererInvoker,
  options: DesktopSourcesRequest,
): Promise<DesktopCapturerSource[]> => {
  const response = await ipc.invoke(DESKTOP_SOURCES_ENUMERATE_CHANNEL, options);
  if (!isDesktopSourcesResponse(response)) {
    throw new Error('Desktop sources response payload is invalid.');
  }
  return response;
};

export const bindDesktopSourcesIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  enumerate: DesktopSourcesBoundary,
): (() => void) => bindAuthorizedIpc(ipc, registry, desktopSourcesContract, (_identity, request) => enumerate(request));
