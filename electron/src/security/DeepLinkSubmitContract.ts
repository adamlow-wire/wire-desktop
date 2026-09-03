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

export const DEEP_LINK_SUBMIT_CHANNEL = 'wire-desktop:deep-link:submit:v1';
export const DEEP_LINK_SUBMIT_CAPABILITY = 'deep-link:submit';
export const MAX_DEEP_LINK_LENGTH = 1_024;
export const MAX_DEEP_LINK_SUBMISSIONS_PER_MINUTE = 30;

export interface DeepLinkSubmitRequest {
  readonly url: string;
}
