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

interface OwnedSsoWindow {
  close(): void;
  focus(): void;
  isOwnedByAccount(accountId: string): boolean;
}

export const controlSsoWindowForAccount = <Window extends OwnedSsoWindow>(
  ssoWindow: Window | null,
  accountId: string | undefined,
  action: 'close' | 'focus',
): Window | null => {
  if (!accountId || !ssoWindow?.isOwnedByAccount(accountId)) {
    return ssoWindow;
  }
  ssoWindow[action]();
  return action === 'close' ? null : ssoWindow;
};
