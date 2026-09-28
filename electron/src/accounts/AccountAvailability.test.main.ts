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

import {strict as assert} from 'node:assert';

import {AccountController} from './AccountController';
import {AccountState} from './AccountState';
import type {AccountViews} from './AccountViews';

import {ACCOUNT_EVENT_CAPABILITY} from '../security/AccountEventContract';
import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

// Real controller/state/authorization, inert view identity, no native windows or user data.
describe('[characterization][ELC-003] account availability badge contract', () => {
  for (const availability of [0, 1, 2, 3, 4, undefined]) {
    it(`suppresses flashing only for wire availability 3 (received ${availability})`, async () => {
      const state = new AccountState([], 3, () => undefined);
      const id = state.snapshots()[0].id;
      const sender = {
        id: 1,
        session: {},
        mainFrame: {url: 'https://account.example.test/'},
        isDestroyed: () => false,
        isLoading: () => false,
      };
      const registry = new ViewIdentityRegistry();
      const identity = registry.register({
        accountId: id,
        allowedOrigin: 'https://account.example.test',
        capabilities: [ACCOUNT_EVENT_CAPABILITY],
        partition: 'availability-fixture',
        session: sender.session,
        viewType: 'account',
        webContents: sender,
      });
      const badges: Array<[number, boolean]> = [];
      const unexpected = () => {
        throw new Error('Unexpected native availability effect.');
      };
      const controller = new AccountController({
        state,
        registry,
        views: {has: () => true, get: () => sender} as unknown as AccountViews,
        destination: () => sender.mainFrame.url,
        session: unexpected,
        clearData: unexpected,
        approveEnvironment: unexpected,
        changed: () => undefined,
        badge: (count, suppress) => badges.push([count, suppress]),
        loaded: () => undefined,
        menu: unexpected,
        accountLimit: unexpected,
      });
      await controller.receive(identity, {type: 'metadata', data: {availability}});
      await controller.receive(identity, {type: 'unread', count: 2});
      assert.deepEqual(badges, [[2, availability === 3]]);
      assert.equal(state.get(id).badgeCount, 2);
    });
  }
});
