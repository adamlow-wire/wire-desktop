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

import {expect, test} from '@playwright/test';

import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

import {WebAppEvents} from '@wireapp/webapp-events';

import type {AccountShellBridge} from '../../../electron/src/preload/AccountShellBridge';
import {App, createApp} from '../../actions/createApp';
import {accountsSidebar} from '../../poms/app/accountsSidebar.page';
import {seedLegacyAccountProfile} from '../../utils/seedLegacyAccountProfile';

test('[regression][CAP-001] sidebar helpers follow native account selection and menus', async ({}, testInfo) => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Sidebar fixture</title><script>
      window.events=[];
      window.amplify={publish(name,...args){window.events.push({name,args})},subscribe(){},unsubscribe(){}};
      window.wire={};window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  let app: App | undefined;
  try {
    await seedLegacyAccountProfile(
      testInfo.outputPath('profile'),
      ids.map((id, index) => ({id, userID: id, visible: index === 0, sessionID: index ? id : undefined})),
    );
    app = await createApp({env: origin, dataDir: testInfo.outputPath('profile')});
    app.wrapper.setDefaultTimeout(10_000);
    const sidebar = accountsSidebar(app);
    const readAccounts = () =>
      app!.wrapper.evaluate(() => (window as unknown as {wireAccounts: AccountShellBridge}).wireAccounts.read());
    const selectedId = () => new URL(app!.page.url()).searchParams.get('id');
    await expect(sidebar.accountItems).toHaveCount(2);

    await sidebar.switchAccount(1);
    expect(selectedId()).toBe(ids[1]);
    await sidebar.switchAccount(0);
    expect(selectedId()).toBe(ids[0]);

    await app.page.evaluate(() => {
      (window as unknown as {wireDesktopBridge: {events: {loaded(): void}}}).wireDesktopBridge.events.loaded();
    });
    await expect.poll(async () => (await readAccounts())[0].lifecycle).toBe('EVENT_TYPE.LIFECYCLE.SIGNED_IN');
    expect(await sidebar.openContextMenu(0)).toEqual([
      {id: 'account-logout', label: 'Log out', enabled: true},
      {id: 'account-remove', label: 'Remove Account', enabled: true},
    ]);
    await sidebar.clickContextMenu('account-logout');
    await expect
      .poll(() => app!.page.evaluate(() => Reflect.get(window, 'events')))
      .toContainEqual({
        name: WebAppEvents.LIFECYCLE.ASK_TO_CLEAR_DATA,
        args: [],
      });
    expect((await readAccounts()).map(account => account.id)).toEqual(ids);

    // An unrelated native page must never become the selected account.
    await app.evaluate(async ({BrowserWindow}) => {
      const auxiliary = new BrowserWindow({show: false, webPreferences: {sandbox: true, nodeIntegration: false}});
      await auxiliary.loadURL('about:blank');
    });
    await sidebar.removeAccount(1);
    await expect.poll(async () => (await readAccounts()).map(account => account.id)).toEqual([ids[0]]);
    expect(selectedId()).toBe(ids[0]);

    await sidebar.addAccount();
    const addedId = (await readAccounts()).find(account => account.visible)!.id;
    expect(addedId).not.toBe(ids[0]);
    expect(selectedId()).toBe(addedId);
    await expect(app.page).toHaveTitle('Sidebar fixture');

    await sidebar.removeAccount(1);
    expect(selectedId()).toBe(ids[0]);
    await sidebar.removeAccount(0);
    const remaining = await readAccounts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).not.toBe(ids[0]);
    expect(selectedId()).toBe(remaining[0].id);
    await expect(app.page).toHaveTitle('Sidebar fixture');
  } finally {
    await app?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
