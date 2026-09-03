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
  DOWNLOAD_LOCATION_UPDATE_CAPABILITY,
  DOWNLOAD_LOCATION_UPDATE_CHANNEL,
  DownloadLocationUpdateRequest,
  MAX_DOWNLOAD_LOCATION_LENGTH,
  MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE,
} from './DownloadLocationContract';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

export {
  DOWNLOAD_LOCATION_UPDATE_CAPABILITY,
  DOWNLOAD_LOCATION_UPDATE_CHANNEL,
  MAX_DOWNLOAD_LOCATION_LENGTH,
  MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE,
} from './DownloadLocationContract';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

interface IpcRendererInvoker {
  invoke(channel: string, request: DownloadLocationUpdateRequest): Promise<unknown>;
}

interface FailureLogger {
  error(message: string, error: unknown): void;
}

type DownloadLocationBoundary = (downloadPath: string | undefined) => void;

const isDownloadLocationUpdateRequest = (value: unknown): value is DownloadLocationUpdateRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const request = value as Partial<DownloadLocationUpdateRequest>;
  return (
    Object.keys(value).length === 1 &&
    Object.prototype.hasOwnProperty.call(value, 'downloadPath') &&
    (typeof request.downloadPath === 'undefined' ||
      (typeof request.downloadPath === 'string' && request.downloadPath.length <= MAX_DOWNLOAD_LOCATION_LENGTH))
  );
};

const downloadLocationContract: AuthorizedIpcContract<DownloadLocationUpdateRequest, void> = Object.freeze({
  capability: DOWNLOAD_LOCATION_UPDATE_CAPABILITY,
  channel: DOWNLOAD_LOCATION_UPDATE_CHANNEL,
  failureMode: 'reject',
  isRequest: isDownloadLocationUpdateRequest,
  isResponse: (value: unknown): value is void => typeof value === 'undefined',
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

export const requestDownloadLocationUpdate = async (
  ipc: IpcRendererInvoker,
  logger: FailureLogger,
  downloadPath: string | undefined,
): Promise<void> => {
  try {
    const response = await ipc.invoke(DOWNLOAD_LOCATION_UPDATE_CHANNEL, {downloadPath});
    if (typeof response !== 'undefined') {
      throw new Error('Download location response payload is invalid.');
    }
  } catch (error) {
    logger.error('Failed to update the download location.', error);
  }
};

export const bindDownloadLocationIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  updateLocation: DownloadLocationBoundary,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, downloadLocationContract, (_identity, request) =>
    updateLocation(request.downloadPath),
  );
