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

export const ACCOUNT_CONTROL_CHANNEL = 'wire-desktop:accounts:control:v1';
export const ACCOUNT_CONTROL_CAPABILITY = 'accounts:control';
export const MAX_ACCOUNT_COMMANDS_PER_MINUTE = 120;
export const ACCOUNT_SNAPSHOTS_CHANNEL = 'wire-desktop:accounts:changed:v1';

export type AccountCommand =
  | {action: 'read' | 'add'}
  | {action: 'select' | 'remove' | 'reload' | 'logout' | 'context-menu'; accountId: string}
  | {action: 'layout'; sidebarWidth: number; headerHeight: number}
  | {action: 'join'; accountId: string; code: string; key: string; domain?: string | null};
