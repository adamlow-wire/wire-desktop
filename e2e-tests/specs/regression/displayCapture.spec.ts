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
import {AddressInfo} from 'node:net';

import {App, createApp} from '../../actions/createApp';

test('[security-target][CAP-003] product PiP cannot outlive its parent account document', async ({}, testInfo) => {
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Owned call fixture</title><script>
      window.amplify={publish(){},subscribe(){},unsubscribe(){}};window.wire={};
      window.z={event:{},lifecycle:{UPDATE_SOURCE:{DESKTOP:'desktop'}},util:{Environment:{avsVersion(){return 'fixture'},version(){return 'fixture'}}}};
    </script>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let app: App | undefined;
  try {
    app = await createApp({env: origin, dataDir: testInfo.outputPath('profile'), mediaConsent: 'deny'});
    await app.page.evaluate(() => {window.open('', 'WIRE_PICTURE_IN_PICTURE_CALL');});
    await expect.poll(() => app!.windows().filter(page => !page.isClosed() && page.url() === 'about:blank').length).toBe(1);
    const child = app.windows().find(page => !page.isClosed() && page.url() === 'about:blank')!;
    expect(await child.evaluate(() => typeof (window as unknown as {require?: unknown}).require)).toBe('undefined');
    await app.page.goto(`${origin}/replacement`);
    await expect.poll(() => child.isClosed()).toBe(true);
  } finally {
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
