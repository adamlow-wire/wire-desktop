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

import {_electron, expect, test} from '@playwright/test';

import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';

import {WebAppEvents} from '@wireapp/webapp-events';

import {seedLegacyAccountProfile} from '../../utils/seedLegacyAccountProfile';

test(
  '[characterization][CAP-001] account controls preserve routing, cancellation and session isolation',
  {tag: ['@regression']},
  async ({}, testInfo) => {
    const server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      if (request.url === '/storage-probe') {
        response.end('<!doctype html><title>Storage probe</title>');
        return;
      }
      response.end(`<!doctype html><title>Account lifecycle fixture</title><script>
      window.events=[];
      addEventListener(${JSON.stringify(
        WebAppEvents.CONVERSATION.JOIN,
      )}, event => window.events.push({name:event.type,args:[event.detail]}));
      window.amplify={publish(name,...args){window.events.push({name,args})},subscribe(){},unsubscribe(){}};
      window.wire={};window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
      window.wireDesktopBridge.events.loaded();
    </script>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const partitionId = '33333333-3333-4333-8333-333333333333';
    const readStorage = `(async () => ({
      local: localStorage.getItem('cap001-cleanup'),
      cached: await caches.has('cap001-cleanup')
        ? await (await (await caches.open('cap001-cleanup')).match('/marker')).text() : null,
      databases: (await indexedDB.databases()).map(database => database.name),
    }))()`;
    const launch = () =>
      _electron.launch({
        chromiumSandbox: true,
        args: [
          '.',
          `--env=${origin}`,
          `--user-data-dir=${testInfo.outputPath('profile')}`,
          'wire://preferences/account',
        ],
      });
    let app: Awaited<ReturnType<typeof launch>> | undefined;
    const readAccounts = () =>
      app!.evaluate(
        ({webContents}, origin) =>
          webContents
            .getAllWebContents()
            .filter(
              contents => contents.getURL().startsWith(origin) && new URL(contents.getURL()).searchParams.has('id'),
            )
            .map(contents => ({id: new URL(contents.getURL()).searchParams.get('id'), loading: contents.isLoading()}))
            .sort((left, right) => left.id!.localeCompare(right.id!)),
        origin,
      );
    try {
      await seedLegacyAccountProfile(
        testInfo.outputPath('profile'),
        ids.map((id, index) => ({
          id,
          userID: id,
          accountIndex: index,
          sessionID: index ? partitionId : undefined,
          badgeCount: 0,
          darkMode: true,
          isAdding: false,
          name: `Account ${index}`,
          teamRole: 'member',
          visible: !index,
          webappUrl: origin,
        })),
      );
      app = await launch();
      // Migration briefly opens a script-disabled storage reader; it is not the application shell.
      const findShell = () =>
        app!.windows().find(page => !page.isClosed() && new URL(page.url()).searchParams.has('env'));
      await expect.poll(() => !!findShell()).toBe(true);
      const shell = findShell()!;
      await expect.poll(readAccounts).toEqual(ids.map(id => ({id, loading: false})));
      expect(await shell.locator('webview').count()).toBe(0);
      expect(
        await app.evaluate(({BrowserWindow, WebContentsView}, origin) => {
          const main = BrowserWindow.getAllWindows().find(window =>
            new URL(window.webContents.getURL()).searchParams.has('env'),
          )!;
          const preferences = (
            main.webContents as Electron.WebContents & {
              getLastWebPreferences(): Electron.WebPreferences;
            }
          ).getLastWebPreferences();
          return {
            webviewTag: preferences.webviewTag,
            accounts: main.contentView.children
              .filter(
                (view): view is Electron.WebContentsView =>
                  view instanceof WebContentsView && view.webContents.getURL().startsWith(origin),
              )
              .map(view => new URL(view.webContents.getURL()).searchParams.get('id'))
              .sort((left, right) => String(left).localeCompare(String(right))),
          };
        }, origin),
      ).toEqual({webviewTag: false, accounts: ids});
      const readLocations = () =>
        app!.evaluate(
          ({webContents}, {origin, ids}) =>
            ids.map(id => {
              const contents = webContents
                .getAllWebContents()
                .find(
                  contents =>
                    contents.getURL().startsWith(origin) && new URL(contents.getURL()).searchParams.get('id') === id,
                )!;
              return new URL(contents.getURL()).hash;
            }),
          {origin, ids},
        );
      await expect.poll(readLocations).toEqual(['#/preferences/account', '']);
      expect(
        await app.evaluate(({ipcMain}) => {
          // [security-target][INV-003] Read-only pinned-runtime inspection; never invoke the retired destructive channel.
          const handlers = Reflect.get(ipcMain, '_invokeHandlers');
          if (!(handlers instanceof Map)) {
            throw new Error('Cannot inspect registered IPC handlers in this Electron version.');
          }
          return handlers.has('wire-desktop:account:delete-data:v1');
        }),
      ).toBe(false);
      await app.evaluate(
        async ({session}, {origin, partitionId}) => {
          const cookie = {url: origin, name: 'marker', expirationDate: Date.now() / 1000 + 3600};
          await session.defaultSession.cookies.set({...cookie, value: 'first'});
          await session.fromPartition(`persist:${partitionId}`).cookies.set({...cookie, value: 'second'});
        },
        {origin, partitionId},
      );
      const seeded = await app.evaluate(
        async ({webContents}, {origin, ids, readStorage}) => {
          const result = [];
          for (const id of ids) {
            const contents = webContents.getAllWebContents().find(contents => {
              const url = new URL(contents.getURL());
              return url.origin === origin && url.searchParams.get('id') === id;
            })!;
            await contents.executeJavaScript(`(async () => {
              localStorage.setItem('cap001-cleanup', ${JSON.stringify(id)});
              await (await caches.open('cap001-cleanup')).put('/marker', new Response(${JSON.stringify(id)}));
              await new Promise((resolve, reject) => {
                const request = indexedDB.open('cap001-cleanup', 1);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => { request.result.close(); resolve(); };
              });
            })()`);
            result.push(await contents.executeJavaScript(readStorage));
          }
          return result;
        },
        {origin, ids, readStorage},
      );
      expect(seeded).toEqual(ids.map(id => ({local: id, cached: id, databases: ['cap001-cleanup']})));

      await shell.locator(`[data-account-id="${ids[1]}"]`).click();
      await expect(shell.locator(`[data-account-id="${ids[1]}"] [data-uie-name="item-selected"]`)).toBeVisible();
      await app.evaluate(({app}) => {
        app.emit('open-url', {preventDefault() {}}, 'wire://preferences/devices');
      });
      await expect.poll(readLocations).toEqual(['#/preferences/account', '#/preferences/devices']);
      await shell.evaluate(async ([first, second]) => {
        await window.sendConversationJoinToHost(first, 'code', 'key', 'example.com');
        await window.sendConversationJoinToHost(first, 'local-code', 'local-key');
        await window.sendConversationJoinToHost(first, 'null-code', 'null-key', null);
        await window.sendLogoutAccount(second);
      }, ids);
      await expect
        .poll(() =>
          app!.evaluate(
            async ({webContents}, {origin, ids, names}) => {
              const results = [];
              for (const id of ids) {
                const account = webContents
                  .getAllWebContents()
                  .find(
                    contents =>
                      contents.getURL().startsWith(origin) && new URL(contents.getURL()).searchParams.get('id') === id,
                  )!;
                results.push(
                  await account.executeJavaScript(
                    `window.events.filter(event => ${JSON.stringify(names)}.includes(event.name))`,
                  ),
                );
              }
              return results;
            },
            {origin, ids, names: [WebAppEvents.CONVERSATION.JOIN, WebAppEvents.LIFECYCLE.ASK_TO_CLEAR_DATA]},
          ),
        )
        .toEqual([
          [
            {name: WebAppEvents.CONVERSATION.JOIN, args: [{code: 'code', key: 'key', domain: 'example.com'}]},
            {name: WebAppEvents.CONVERSATION.JOIN, args: [{code: 'local-code', key: 'local-key', domain: undefined}]},
            {name: WebAppEvents.CONVERSATION.JOIN, args: [{code: 'null-code', key: 'null-key', domain: null}]},
          ],
          [{name: WebAppEvents.LIFECYCLE.ASK_TO_CLEAR_DATA, args: []}],
        ]);

      await shell.locator('[data-uie-name="do-open-plus-menu"]').click();
      await expect.poll(readAccounts).toHaveLength(3);
      await shell.locator('[data-uie-name="do-close-webview"]').click();
      await expect.poll(readAccounts).toHaveLength(2);
      const logMarkers = ids.map(id =>
        path.join(testInfo.outputPath('profile'), 'logs', '2099-01-01', 'accounts', id, 'deletion-marker.log'),
      );
      for (const file of logMarkers) {
        await mkdir(path.dirname(file), {recursive: true});
        await writeFile(file, 'account-specific marker');
      }
      // Observe the actual main-owned native menu; no test command is exposed to the shell or guest.
      await app.evaluate(({Menu}) => {
        const popup = Menu.prototype.popup;
        Menu.prototype.popup = function (options) {
          Reflect.set(globalThis, '__cap001NativeMenu', this);
          Menu.prototype.popup = popup;
          popup.call(this, options);
        };
      });
      await shell.locator(`[data-account-id="${ids[1]}"]`).click({button: 'right'});
      await expect
        .poll(() =>
          app!.evaluate(() => {
            const menu = Reflect.get(globalThis, '__cap001NativeMenu') as Electron.Menu | undefined;
            return menu?.items.map(item => item.id);
          }),
        )
        .toEqual(['account-logout', 'account-remove']);
      await app.evaluate(({BrowserWindow}) => {
        const menu = Reflect.get(globalThis, '__cap001NativeMenu') as Electron.Menu;
        const remove = menu.getMenuItemById('account-remove')!;
        menu.closePopup();
        remove.click(remove, BrowserWindow.getAllWindows()[0], {} as Electron.KeyboardEvent);
        Reflect.deleteProperty(globalThis, '__cap001NativeMenu');
      });
      await expect.poll(readAccounts).toEqual([{id: ids[0], loading: false}]);
      // Closing the native view precedes cleanup; profile/sidebar removal signals completion.
      await expect(shell.locator(`[data-account-id="${ids[1]}"]`)).toHaveCount(0);
      await expect(access(logMarkers[1])).rejects.toMatchObject({code: 'ENOENT'});
      expect(await readFile(logMarkers[0], 'utf8')).toBe('account-specific marker');
      const cookies = await app.evaluate(
        async ({session}, {origin, partitionId}) => ({
          first: (await session.defaultSession.cookies.get({url: origin, name: 'marker'})).map(cookie => cookie.value),
          removed: (
            await session.fromPartition(`persist:${partitionId}`).cookies.get({url: origin, name: 'marker'})
          ).map(cookie => cookie.value),
        }),
        {origin, partitionId},
      );
      expect(cookies).toEqual({first: ['first'], removed: []});
      await app.evaluate(({app}) => {
        app.emit('open-url', {preventDefault() {}}, 'wire://start-login');
        app.emit('open-url', {preventDefault() {}}, 'wire://conversation-join?code=ordered-code&key=ordered-key');
      });
      await expect.poll(readAccounts).toHaveLength(2);
      const newAccountId = (await readAccounts()).find(account => account.id !== ids[0])!.id!;
      await expect
        .poll(() =>
          app!.evaluate(
            async ({webContents}, {origin, targets, eventName}) => {
              const results = [];
              for (const id of targets) {
                const contents = webContents
                  .getAllWebContents()
                  .find(
                    contents =>
                      contents.getURL().startsWith(origin) && new URL(contents.getURL()).searchParams.get('id') === id,
                  )!;
                results.push(
                  await contents.executeJavaScript(
                    `window.events.filter(event => event.name === ${JSON.stringify(
                      eventName,
                    )} && event.args[0]?.code === 'ordered-code')`,
                  ),
                );
              }
              return results;
            },
            {origin, targets: [ids[0], newAccountId], eventName: WebAppEvents.CONVERSATION.JOIN},
          ),
        )
        .toEqual([
          [],
          [{name: WebAppEvents.CONVERSATION.JOIN, args: [{code: 'ordered-code', key: 'ordered-key', domain: null}]}],
        ]);

      // [migration][DCP-004] Verify actual persistent data after the owning app exits and restarts.
      await app.close();
      app = undefined;
      app = await launch();
      await expect.poll(readAccounts).toEqual([ids[0], newAccountId].sort().map(id => ({id, loading: false})));
      const restarted = await app.evaluate(
        async ({BrowserWindow, session}, {origin, partitionId, readStorage}) => {
          const result = [];
          for (const owned of [session.defaultSession, session.fromPartition(`persist:${partitionId}`)]) {
            const probe = new BrowserWindow({
              show: false,
              webPreferences: {
                session: owned,
                sandbox: true,
                contextIsolation: true,
                nodeIntegration: false,
                webviewTag: false,
              },
            });
            try {
              await probe.loadURL(`${origin}/storage-probe`);
              result.push({
                storage: await probe.webContents.executeJavaScript(readStorage),
                cookies: (await owned.cookies.get({url: origin, name: 'marker'})).map(cookie => cookie.value),
              });
            } finally {
              const destroyed = new Promise<void>(resolve => probe.webContents.once('destroyed', () => resolve()));
              probe.destroy();
              await destroyed;
            }
          }
          return result;
        },
        {origin, partitionId, readStorage},
      );
      expect(restarted).toEqual([
        {storage: {local: ids[0], cached: ids[0], databases: ['cap001-cleanup']}, cookies: ['first']},
        {storage: {local: null, cached: null, databases: []}, cookies: []},
      ]);
    } finally {
      if (app) {
        await app.close();
      }
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
);
