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

import {ACCOUNT_POPUP_GRANT_CHANNEL} from '../security/AccountPopupGrantContract';

interface SyncIpcInvoker {
  sendSync(channel: string, request: {url: string; frameName: string}): unknown;
}

export const requestAccountPopupGrant = (
  ipc: SyncIpcInvoker,
  url: string,
  frameName: string,
  logger: Pick<Console, 'warn'>,
): string | undefined => {
  try {
    const token = ipc.sendSync(ACCOUNT_POPUP_GRANT_CHANNEL, {url, frameName});
    if (typeof token === 'string' && /^[0-9a-f]{32}$/.test(token)) {
      return token;
    }
  } catch {
    // The destination or sender may have been rejected. Do not log either value.
  }
  logger.warn('Account popup authorization rejected.');
  return undefined;
};
