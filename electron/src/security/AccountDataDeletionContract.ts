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

export const ACCOUNT_DATA_DELETE_CHANNEL = 'wire-desktop:account:delete-data:v1';
export const ACCOUNT_DATA_DELETE_CAPABILITY = 'account-data:delete';
export const MAX_ACCOUNT_DELETIONS_PER_MINUTE = 20;

export interface AccountDataDeletionRequest {
  readonly accountId: string;
  readonly partitionId?: string;
  readonly webContentsId: number;
}
