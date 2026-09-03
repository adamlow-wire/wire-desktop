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

export const DESKTOP_SOURCES_ENUMERATE_CHANNEL = 'wire-desktop:desktop-sources:enumerate:v1';
export const DESKTOP_SOURCES_ENUMERATE_CAPABILITY = 'media:desktop-sources';
export const MAX_DESKTOP_SOURCE_REQUESTS_PER_MINUTE = 30;
export const MAX_DESKTOP_SOURCES = 512;
export const MAX_DESKTOP_SOURCE_THUMBNAIL_DIMENSION = 1_024;

export interface DesktopSourcesRequest {
  readonly fetchWindowIcons?: boolean;
  readonly thumbnailSize?: Readonly<{height: number; width: number}>;
  readonly types: Array<'screen' | 'window'>;
}
