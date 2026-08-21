/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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

import {
  ACCOUNT_ACTION,
  addAccount,
  deleteAccount,
  shouldAcceptBadgeCount,
  updateAccount,
  updateAccountBadge,
  updateAccountBadgeCount,
} from '../';
import type {State} from '../../index';
import {generateUUID} from '../../lib/util';
import {createAccount} from '../../reducers/accountReducer';
import {switchAccount} from '../AccountAction';

describe('action creators', () => {
  describe('addAccount', () => {
    it('should create action to add account with session', () => {
      const action = addAccount();
      expect(action.type).toEqual(ACCOUNT_ACTION.ADD_ACCOUNT);
      expect(action.sessionID).toEqual(expect.any(String));
    });
  });

  describe('updateAccount', () => {
    it('should create action to update account', () => {
      const id = generateUUID();
      const data = {name: 'Foo'};
      const action = {
        data,
        id,
        type: ACCOUNT_ACTION.UPDATE_ACCOUNT,
      };
      expect(updateAccount(id, data)).toEqual(action);
    });
  });

  describe('switchAccount', () => {
    it('should create action to switch account', () => {
      const id = generateUUID();
      const action = {
        id,
        type: ACCOUNT_ACTION.SWITCH_ACCOUNT,
      };
      expect(switchAccount(id)).toEqual(action);
    });
  });

  describe('updateAccountBadge', () => {
    it('should create action to update account badge', () => {
      const id = generateUUID();
      const count = 42;
      const action = {
        count,
        id,
        type: ACCOUNT_ACTION.UPDATE_ACCOUNT_BADGE,
      };
      expect(updateAccountBadge(id, count)).toEqual(action);
    });
  });

  describe('shouldAcceptBadgeCount', () => {
    it('[characterization][DCP-001] preserves unread state reported by a hidden account', () => {
      const account = {...createAccount({visible: false}), badgeCount: 1};

      expect(shouldAcceptBadgeCount(account, 0)).toBe(false);
    });

    it('[characterization][DCP-001] accepts increases from hidden accounts and changes from visible accounts', () => {
      const hiddenAccount = {...createAccount({visible: false}), badgeCount: 1};
      const visibleAccount = {...createAccount({visible: true}), badgeCount: 1};

      expect(shouldAcceptBadgeCount(hiddenAccount, 2)).toBe(true);
      expect(shouldAcceptBadgeCount(visibleAccount, 0)).toBe(true);
    });

    it('[characterization][DCP-001] keeps the application badge and state unread while the account is hidden', () => {
      const account = {...createAccount({visible: false}), badgeCount: 1};
      const dispatch = jest.fn();
      const sendBadgeCount = jest.fn();
      const state: State = {
        accounts: [account],
        contextMenuState: {accountId: '', isAtLeastAdmin: false, position: {centerX: 0, centerY: 0}},
      };
      window.sendBadgeCount = sendBadgeCount;

      updateAccountBadgeCount(account.id, 0)(dispatch, () => state);

      expect(sendBadgeCount).toHaveBeenCalledWith(1, false);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('deleteAccount', () => {
    it('should create action to delete an account', () => {
      const id = generateUUID();
      const action = {
        id,
        type: ACCOUNT_ACTION.DELETE_ACCOUNT,
      };
      expect(deleteAccount(id)).toEqual(action);
    });
  });
});
