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

export const ACCOUNT_EVENT_CHANNEL = 'wire-desktop:account:event:v1';
export const ACCOUNT_EVENT_CAPABILITY = 'account:event';
export const MAX_ACCOUNT_EVENTS_PER_MINUTE = 600;

export interface AccountMetadata {
  accentID?: number;
  availability?: number;
  darkMode?: boolean;
  name?: string;
  picture?: string;
  teamID?: string;
  teamRole?: string;
  userID?: string;
  webappUrl?: string;
}

export type AccountEvent =
  | {type: 'loaded' | 'sign-out' | 'activate'}
  | {type: 'signed-out'; clearData: boolean}
  | {type: 'metadata'; data: AccountMetadata}
  | {type: 'theme'; theme: string}
  | {type: 'unread'; count: number}
  | {type: 'environment'; url: string}
  | {type: 'join'; code: string; key: string; domain?: string | null};
