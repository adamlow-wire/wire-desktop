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

export const SAVE_PICTURE_CHANNEL = 'wire-desktop:save-picture:v1';
export const SAVE_PICTURE_CAPABILITY = 'picture:save';
export const MAX_SAVE_PICTURE_BYTES = 15 * 1024 * 1024;

export interface SavePictureRequest {
  readonly bytes: Uint8Array;
  readonly timestamp?: string;
}
