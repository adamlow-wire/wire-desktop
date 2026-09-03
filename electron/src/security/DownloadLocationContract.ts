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

export const DOWNLOAD_LOCATION_UPDATE_CHANNEL = 'wire-desktop:download-location:update:v1';
export const DOWNLOAD_LOCATION_UPDATE_CAPABILITY = 'settings:download-location';
export const MAX_DOWNLOAD_LOCATION_LENGTH = 4_096;
export const MAX_DOWNLOAD_LOCATION_UPDATES_PER_MINUTE = 12;

export interface DownloadLocationUpdateRequest {
  readonly downloadPath: string | undefined;
}
