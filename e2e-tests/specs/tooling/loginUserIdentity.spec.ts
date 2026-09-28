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

import {test, type Page} from '@playwright/test';

import assert from 'node:assert/strict';

import type {User} from '../../actions/createUser';
import {loginUser} from '../../actions/loginUser';

const USER = {
  firstName: 'Alice',
  lastName: 'Low',
  initials: 'AL',
  fullName: 'Alice Low',
  username: 'alice',
  email: 'alice@example.test',
  password: 'fixture-password',
} satisfies User;

const makeLoginPages = (foreign: {id: string; initials: string}) => {
  const pages: Page[] = [];
  let clicks = 0;
  const makePage = (id: string, initials: string, visible: boolean): Page => {
    const locator = {
      fill: async () => undefined,
      click: async () => {
        if (++clicks === 2) {
          pages.push(foreignPage);
        }
      },
      getByRole: () => locator,
      getByTestId: () => locator,
      isVisible: async () => visible,
      textContent: async () => initials,
    };
    return {
      url: () => `https://wire.example.test/?id=${id}`,
      context: () => ({pages: () => pages}),
      getByRole: () => locator,
      getByPlaceholder: () => locator,
      getByTestId: () => locator,
      locator: () => locator,
    } as unknown as Page;
  };
  const loginPage = makePage('11111111-1111-4111-8111-111111111111', '', false);
  const foreignPage = makePage(foreign.id, foreign.initials, true);
  pages.push(loginPage);
  return {loginPage, foreignPage};
};

test.describe('E2E login account selection', () => {
  test('does not accept a newly opened foreign account with a different avatar', async () => {
    const {loginPage} = makeLoginPages({id: '11111111-1111-4111-8111-111111111111', initials: 'ZZ'});
    await assert.rejects(() => loginUser(loginPage, USER, {timeout: 150}), /Wait for AL's authenticated account page/);
  });

  test('does not accept a newly opened foreign account with matching initials', async () => {
    const {loginPage} = makeLoginPages({id: '22222222-2222-4222-8222-222222222222', initials: 'AL'});
    await assert.rejects(() => loginUser(loginPage, USER, {timeout: 150}), /Wait for AL's authenticated account page/);
  });

  test('returns the matching account replacement page', async () => {
    const {loginPage, foreignPage} = makeLoginPages({
      id: '11111111-1111-4111-8111-111111111111',
      initials: 'AL',
    });
    assert.strictEqual(await loginUser(loginPage, USER, {timeout: 150}), foreignPage);
  });
});
