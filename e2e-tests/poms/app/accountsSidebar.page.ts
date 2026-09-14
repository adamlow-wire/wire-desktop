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

import {expect} from '@playwright/test';

import type {AccountShellBridge} from '../../../electron/src/preload/AccountShellBridge';
import {App} from '../../actions/createApp';
import {RegisteredUser} from '../../backend/PublicApiClient';

export const accountsSidebar = (app: App) => {
  const sidebar = app.wrapper.getByRole('navigation', {name: 'Accounts Sidebar'});

  const accountItems = sidebar.getByTestId('account-cell');
  const addAccountButton = sidebar.getByTestId('do-open-plus-menu');

  const readAccounts = () =>
    app.wrapper.evaluate(() => (window as unknown as {wireAccounts: AccountShellBridge}).wireAccounts.read());

  const updateSelectedPage = async () => {
    await expect
      .poll(async () => {
        const selected = (await readAccounts()).find(account => account.visible);
        const page = app
          .windows()
          .find(page => !page.isClosed() && new URL(page.url()).searchParams.get('id') === selected?.id);
        if (page) {
          app.page = page;
        }
        return Boolean(page);
      })
      .toBe(true);
  };

  const openContextMenu = async (index: number) => {
    // Observe the real main-owned menu; native items are not DOM locators.
    await app.evaluate(({Menu}) => {
      Reflect.deleteProperty(globalThis, 'wireE2EAccountMenu');
      const popup = Menu.prototype.popup;
      Reflect.set(globalThis, 'wireE2EOriginalMenuPopup', popup);
      Menu.prototype.popup = function (options) {
        Reflect.set(globalThis, 'wireE2EAccountMenu', {menu: this, owner: options?.window});
        Menu.prototype.popup = popup;
        popup.call(this, options);
      };
    });
    try {
      await accountItems.nth(index).click({button: 'right'});
      await expect.poll(() => app.evaluate(() => Reflect.has(globalThis, 'wireE2EAccountMenu'))).toBe(true);
      return await app.evaluate(() => {
        const {menu} = Reflect.get(globalThis, 'wireE2EAccountMenu') as {menu: Electron.Menu};
        return menu.items
          .filter(item => item.visible)
          .map(item => ({id: item.id, label: item.label, enabled: item.enabled}));
      });
    } finally {
      await app.evaluate(({Menu}) => {
        Menu.prototype.popup = Reflect.get(globalThis, 'wireE2EOriginalMenuPopup');
        Reflect.deleteProperty(globalThis, 'wireE2EOriginalMenuPopup');
      });
    }
  };

  const clickContextMenu = async (id: 'account-logout' | 'account-remove') => {
    await app.evaluate((_, id) => {
      const target = Reflect.get(globalThis, 'wireE2EAccountMenu') as
        | {menu: Electron.Menu; owner?: Electron.BrowserWindow}
        | undefined;
      const item = target?.menu.getMenuItemById(id);
      if (!target?.owner || target.owner.isDestroyed() || !item?.enabled || !item.visible) {
        throw new Error(`Account menu item unavailable: ${id}`);
      }
      target.menu.closePopup();
      Reflect.deleteProperty(globalThis, 'wireE2EAccountMenu');
      item.click(item, target.owner, {} as Electron.KeyboardEvent);
    }, id);
  };

  const getAccount = (user: RegisteredUser) => {
    const accountLocator = sidebar.locator(`[data-account-id="${user.id}"]`);
    return Object.assign(accountLocator, {
      activeBorder: accountLocator.getByTestId('item-selected'),
      notificationDot: accountLocator.getByText('New message or missed call'),
    });
  };

  /* Trigger the flow to add a new account, selecting its native page. */
  const addAccount = async () => {
    await sidebar.hover();
    const ids = (await readAccounts()).map(account => account.id);
    await addAccountButton.click();
    await expect
      .poll(async () => (await readAccounts()).some(account => account.visible && !ids.includes(account.id)))
      .toBe(true);
    await updateSelectedPage();
  };

  /* Switch to the account at the given index, replacing the currently shown page with the page of the other account */
  const switchAccount = async (index: number) => {
    const targetId = (await readAccounts())[index].id;
    await accountItems.nth(index).click();
    await expect.poll(async () => (await readAccounts()).find(account => account.visible)?.id).toBe(targetId);
    await updateSelectedPage();
  };

  const logOut = async (index: number) => {
    await openContextMenu(index);
    await clickContextMenu('account-logout');
  };

  const removeAccount = async (index: number) => {
    const removedId = (await readAccounts())[index].id;
    await openContextMenu(index);
    await clickContextMenu('account-remove');
    await expect.poll(async () => (await readAccounts()).some(account => account.id === removedId)).toBe(false);
    await updateSelectedPage();
  };

  return Object.assign(sidebar, {
    sidebar,
    accountItems,
    addAccountButton,
    openContextMenu,
    clickContextMenu,
    getAccount,
    addAccount,
    switchAccount,
    logOut,
    removeAccount,
  });
};
