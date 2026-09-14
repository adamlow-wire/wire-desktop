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

import {createApp, type App} from '../../actions/createApp';

for (const [outcome, query] of [
  ['authorization response', 'code=fixture-code&state=fixture-state&session_state=fixture-session'],
  ['user cancellation', 'error=access_denied&state=fixture-state'],
  ['interactive authentication required', 'error=login_required&state=fixture-state'],
] as const) {
  test(`[characterization][CAP-002][DCP-022] E2EI ${outcome} transport preserves its account and denies an unregistered provider`, async ({}, testInfo) => {
    let providerRequests = 0;
    const provider = createServer((_request, response) => {
      providerRequests++;
      response.end('Local identity provider fixture');
    });
    const account = createServer((request, response) => {
      const url = new URL(request.url!, 'http://fixture.invalid');
      if (url.pathname === '/oidc') {
        // Match the webapp server redirect; these inert values do not authenticate or enrol a device.
        response.writeHead(302, {Location: `/?${url.searchParams}#/e2ei-redirect`});
        response.end();
        return;
      }
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>E2EI transport fixture</title>');
    });
    let app: App | undefined;
    try {
      await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
      await new Promise<void>(resolve => account.listen(0, '127.0.0.1', resolve));
      const origin = `http://127.0.0.1:${(account.address() as AddressInfo).port}`;
      const providerUrl = `http://127.0.0.1:${(provider.address() as AddressInfo).port}/authorize?client_id=fixture`;
      app = await createApp({env: origin, dataDir: testInfo.outputPath('profile')});
      await expect(app.page).toHaveTitle('E2EI transport fixture');
      const originalUrl = app.page.url();
      await app.page.evaluate(() => sessionStorage.setItem('oidc.fixture-state', 'account-owned-state'));
      const prevented = await app.evaluate(
        async ({webContents}, {originalUrl, providerUrl}) => {
          const contents = webContents.getAllWebContents().find(contents => contents.getURL() === originalUrl)!;
          const navigation = new Promise<boolean>(resolve => {
            contents.once('will-navigate', event => resolve(event.defaultPrevented));
          });
          await contents.executeJavaScript(`location.href=${JSON.stringify(providerUrl)}; undefined`);
          return navigation;
        },
        {originalUrl, providerUrl},
      );
      expect(prevented).toBe(true);
      expect(providerRequests).toBe(0);
      expect(app.page.url()).toBe(originalUrl);

      // Transport-only positive control, not an OIDC state-validation or enrolment-success assertion.
      await app.page.evaluate(url => {
        location.href = url;
      }, `${origin}/oidc?${query}`);
      await expect(app.page).toHaveURL(`${origin}/?${query}#/e2ei-redirect`);
      expect(await app.page.evaluate(() => sessionStorage.getItem('oidc.fixture-state'))).toBe('account-owned-state');
    } finally {
      await app?.close();
      await Promise.all([account, provider].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    }
  });
}
