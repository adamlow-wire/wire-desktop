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

import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

import {expect, test as fixtureTest} from '../../fixtures';

const test = fixtureTest.extend({
  appOptions: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Fixture restart</title>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await use({env: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, lang: 'en'});
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
});

test('[regression][TST-005] shared app fixture supports an intentional restart', async ({app}) => {
  const reopened = await app.reopen();
  await expect(reopened.page).toHaveTitle('Fixture restart');
});
