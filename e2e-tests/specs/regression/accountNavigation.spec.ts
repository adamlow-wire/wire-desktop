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

import {createServer} from 'node:http';
import {AddressInfo} from 'node:net';

import {WebAppEvents} from '@wireapp/webapp-events';

test(
  '[security-target][SEC-008] product navigation and main-owned SSO fail closed',
  {tag: ['@regression']},
  async ({}, testInfo) => {
    let hostileRequests = 0;
    const hostile = createServer((_request, response) => {
      hostileRequests++;
      response.end('unauthorized destination');
    });
    await new Promise<void>(resolve => hostile.listen(0, '127.0.0.1', resolve));
    const hostileOrigin = `http://127.0.0.1:${(hostile.address() as AddressInfo).port}`;
    const server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, {Location: `${hostileOrigin}/escape`});
      } else {
        response.setHeader('Content-Type', 'text/html');
      }
      response.end(`<!doctype html><title>Local Wire boundary fixture</title><script>
      window.desktopEvents=[];window.amplify={publish(name){window.desktopEvents.push(name)},subscribe(){},unsubscribe(){}};window.wire={};
      window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
    </script>`);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let application: Awaited<ReturnType<typeof _electron.launch>> | undefined;
    try {
      const app = (application = await _electron.launch({
        chromiumSandbox: true,
        args: ['.', `--env=${origin}`, `--user-data-dir=${testInfo.outputPath('profile')}`],
      }));
      await expect
        .poll(() =>
          app.evaluate(({webContents}) => {
            const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview');
            return Boolean(account && !account.isLoading() && account.getURL().startsWith('http://127.0.0.1:'));
          }),
        )
        .toBe(true);
      expect(
        await app.evaluate(
          ({app}) => app.commandLine.hasSwitch('enable-sandbox') && !app.commandLine.hasSwitch('no-sandbox'),
        ),
      ).toBe(true);

      await app.evaluate(async ({webContents}) => {
        const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview')!;
        const loaded = new Promise<void>(resolve => account.once('did-finish-load', () => resolve()));
        await account.executeJavaScript("location.href='/allowed'; undefined");
        await loaded;
      });
      for (const [url, event] of [
        [`${hostileOrigin}/escape`, 'will-navigate'],
        [`${origin}/redirect`, 'will-redirect'],
      ] as const) {
        const result = await app.evaluate(
          async ({webContents}, {url, event}) => {
            const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview')!;
            const canceled = new Promise<boolean>(resolve => {
              const listener = (event: Electron.Event) => resolve(event.defaultPrevented);
              if (event === 'will-navigate') {
                account.once('will-navigate', listener);
              } else {
                account.once('will-redirect', listener);
              }
            });
            await account.executeJavaScript(`location.href=${JSON.stringify(url)}; undefined`);
            return {canceled: await canceled, url: account.getURL()};
          },
          {url, event},
        );
        expect(result).toEqual({canceled: true, url: `${origin}/allowed`});
        expect(hostileRequests).toBe(0);
      }

      const profileRoute = '/user/266d36c0-ae62-48b5-91b5-b10ed42f1a0f';
      const deepLinkResult = await app.evaluate(async ({webContents, shell}, route) => {
        const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview')!;
        const externalCalls: string[] = [];
        const openExternal = shell.openExternal;
        shell.openExternal = async url => {
          externalCalls.push(url);
        };
        try {
          const hash = await account.executeJavaScript(`new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Custom link was not routed internally')), 3000);
            window.addEventListener('hashchange', () => {
              clearTimeout(timeout); resolve(location.hash);
            }, {once:true});
            const link = document.createElement('a');
            link.href = ${JSON.stringify(`wire:/${route}`)};
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            document.body.append(link); link.click();
          })`);
          return {hash, externalCalls};
        } finally {
          shell.openExternal = openExternal;
        }
      }, profileRoute);
      expect(deepLinkResult).toEqual({hash: `#${profileRoute}`, externalCalls: []});

      for (let attempt = 0; attempt < 2; attempt++) {
        expect(
          await app.evaluate(async ({webContents}, origin) => {
            const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview')!;
            return account.executeJavaScript(
              `window.desktopEvents=[]; window.open(${JSON.stringify(`${origin}/sso`)}, 'WIRE_SSO') === null`,
            );
          }, origin),
        ).toBe(true);
        await expect
          .poll(() =>
            app.evaluate(
              ({BrowserWindow, session}, origin) =>
                BrowserWindow.getAllWindows().filter(
                  window =>
                    window.webContents.session === session.fromPartition('sso') &&
                    window.webContents.getURL() === `${origin}/sso`,
                ).length,
              origin,
            ),
          )
          .toBe(1);

        await app.evaluate(async ({webContents}) => {
          const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview')!;
          await account.executeJavaScript(
            'window.wireDesktopBridge.events.focusSsoWindow(); window.wireDesktopBridge.events.closeSsoWindow(); undefined',
          );
        });
        await expect
          .poll(() =>
            app.evaluate(async ({webContents}, event) => {
              const account = webContents.getAllWebContents().find(contents => contents.getType() === 'webview')!;
              return account.executeJavaScript(`window.desktopEvents.includes(${JSON.stringify(event)})`);
            }, WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED),
          )
          .toBe(true);
        await expect
          .poll(() =>
            app.evaluate(
              ({BrowserWindow, session}) =>
                BrowserWindow.getAllWindows().filter(
                  window => window.webContents.session === session.fromPartition('sso'),
                ).length,
            ),
          )
          .toBe(0);
      }
    } finally {
      if (application) {
        await application.close();
      }
      await Promise.all([server, hostile].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    }
  },
);
