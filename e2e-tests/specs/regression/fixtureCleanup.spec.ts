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

import type {Page} from '@playwright/test';

import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';

import {expect, test as baseTest} from '../../fixtures';

const test = baseTest.extend({
  baseURL: async ({}, use) => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><button>Activate</button>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  },
});

const pages: Page[] = [];
const dialogs: string[] = [];

test.afterAll(() => {
  expect(pages).toHaveLength(2);
  expect(pages.every(page => page.isClosed())).toBe(true);
  expect(dialogs).toEqual([]);
});

test(
  'test-only browser contexts close without starting unload dialogs',
  {tag: ['@regression']},
  async ({createPage}) => {
    for (let index = 0; index < 2; index++) {
      const page = await createPage();
      pages.push(page);
      page.on('dialog', dialog => dialogs.push(dialog.type()));
      await page.getByRole('button', {name: 'Activate'}).click();
      await page.evaluate(() => {
        window.onbeforeunload = () => true;
      });
    }
  },
);
