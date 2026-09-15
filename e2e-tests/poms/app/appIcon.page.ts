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

import type {AccountShellBridge} from '../../../electron/src/preload/AccountShellBridge';
import {App} from '../../actions/createApp';

export const appIcon = (app: App) => {
  return {
    getUnreadCount: async () => {
      const platform = await app.evaluate(() => process.platform);
      if (platform !== 'linux') {
        return app.evaluate(({app}) => app.getBadgeCount());
      }
      // Linux desktop shells do not consistently support numeric dock badges.
      // Observe main-owned unread state; native tray transitions have separate tests.
      return app.wrapper.evaluate(async () => {
        const accounts = await (window as unknown as {wireAccounts: AccountShellBridge}).wireAccounts.read();
        return accounts.reduce((count, account) => count + account.badgeCount, 0);
      });
    },
  };
};
