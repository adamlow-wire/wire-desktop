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

import {Page} from '@playwright/test';

import {App} from './createApp';

import type {AccountShellBridge} from '../../electron/src/preload/AccountShellBridge';

// eslint-disable-next-line valid-jsdoc
/**
 * Action to observe the list of accounts inside the apps sidebar.
 * If the currently active one changes the `onChange` callback will be triggered, receiving the new active page.
 * This is required in cases where the account switch isn't initiated by us but through some external event (e.g. clicking a notification or opening a deep link).
 * Also make sure to assert on the new account already being active before continuing to ensure the callback already finished.
 *
 * @example
 * await watchActiveAccount(app, newActivePage => (app.page = newActivePage));
 * await clickNotification({body: 'Test Message'});
 * await expect(accountsSidebar(app).getAccount(userA2).activeBorder).toBeVisible();
 */
export const watchActiveAccount = async (app: App, onChange: (newPage: Page) => void) => {
  /* Notify Playwright of main-owned account selection changes. */
  const onActiveAccountChange = (newAccountId: string) => {
    const newActivePage = app.windows().find(page => {
      return !page.isClosed() && newAccountId === new URL(page.url()).searchParams.get('id');
    });

    // If there's a new active account, update the page property of app with its page
    if (newActivePage !== undefined && newActivePage !== app.page) {
      onChange(newActivePage);
    }
  };
  await app.wrapper.exposeFunction('onActiveAccountChange', onActiveAccountChange);

  await app.wrapper.evaluate(async () => {
    const shell = window as unknown as {
      wireAccounts: AccountShellBridge;
      onActiveAccountChange(id: string): Promise<void>;
    };
    shell.wireAccounts.subscribe(accounts => {
      const activeAccountId = accounts.find(account => account.visible)?.id;
      if (activeAccountId !== undefined) {
        void shell.onActiveAccountChange(activeAccountId);
      }
    });
    await shell.wireAccounts.read();
  });
};
