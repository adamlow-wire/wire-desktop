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
  updateAccountData,
} from '../';
import type {AppDispatch, State} from '../../index';
import {generateUUID} from '../../lib/util';
import accountReducer, {createAccount} from '../../reducers/accountReducer';
import {AccountAction, switchAccount} from '../AccountAction';

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

  describe('updateAccountData', () => {
    it('[security-target][CAP-001] cannot remove another account picture while updating metadata', () => {
      const account = {...createAccount(), picture: 'data:image/png;base64,dGFyZ2V0'};
      const other = {...createAccount(), picture: 'data:image/png;base64,b3RoZXI='};
      const originalOther = {...other};
      let accounts: State['accounts'] = [account, other];
      const dispatch = jest.fn((action: Parameters<typeof accountReducer>[1]) => {
        accounts = accountReducer(accounts, action);
        return action;
      });

      updateAccountData(account.id, {userID: generateUUID(), name: 'Updated team'})(dispatch as AppDispatch);

      expect(accounts[0].picture).toBeUndefined();
      expect(accounts[1]).toEqual(originalOther);
      expect(accounts[1]).toBe(other);
    });

    it('[security-target][CAP-001] preserves prior state and the action while clearing a picture', () => {
      const account = Object.freeze({
        ...createAccount(),
        picture: 'data:image/png;base64,dGFyZ2V0',
        webappUrl: 'https://custom.example.test/',
      });
      const data = Object.freeze({name: 'Updated team', webappUrl: undefined});

      const [updated] = accountReducer([account], updateAccount(account.id, data));

      expect(updated.picture).toBeUndefined();
      expect(updated.webappUrl).toBe(account.webappUrl);
      expect(updated.name).toBe(data.name);
      expect(account.picture).toBe('data:image/png;base64,dGFyZ2V0');
      expect(Object.prototype.hasOwnProperty.call(data, 'webappUrl')).toBe(true);
    });

    it('[characterization][CAP-001] applies webapp metadata only to the addressed account', () => {
      const account = createAccount({sessionID: generateUUID()});
      const other = createAccount({sessionID: generateUUID()});
      let accounts = [account, other];
      const dispatch = jest.fn((action: Parameters<typeof accountReducer>[1]) => {
        accounts = accountReducer(accounts, action);
        return action;
      });
      const metadata = {
        accentID: 2,
        availability: 1,
        name: 'Example team',
        picture: 'data:image/png;base64,aGVsbG8=',
        teamID: generateUUID(),
        teamRole: 'member',
        userID: generateUUID(),
      };

      updateAccountData(account.id, metadata)(dispatch as AppDispatch);

      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(accounts[0]).toEqual({...account, ...metadata, isAdding: false, ssoCode: undefined});
      expect(accounts[1]).toBe(other);
    });

    it('[characterization][CAP-001] preserves the separate environment URL update', () => {
      const dispatch = jest.fn();
      const id = generateUUID();
      const data = {webappUrl: 'https://custom.example.test/auth/'};

      updateAccountData(id, data)(dispatch);

      expect(dispatch).toHaveBeenCalledWith(updateAccount(id, data));
    });

    it.each([
      {id: 'different-account'},
      {sessionID: 'different-session'},
      {visible: true},
      {isAdding: true},
      {badgeCount: 0},
      {ssoCode: 'different-flow'},
      {accountIndex: 0},
      {lifecycle: 'signed-in'},
      {unexpected: 'field'},
    ])('[security-target][CAP-001] rejects desktop-owned or unknown metadata %j', injected => {
      const account = createAccount({sessionID: generateUUID(), visible: false});
      const other = createAccount({sessionID: generateUUID()});
      const initial = [account, other];
      let accounts = initial;
      const dispatch = jest.fn((action: Parameters<typeof accountReducer>[1]) => {
        accounts = accountReducer(accounts, action);
        return action;
      });
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        updateAccountData(account.id, {userID: generateUUID(), ...injected})(dispatch as AppDispatch);

        expect(accounts).toBe(initial);
        expect(dispatch).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it.each([null, undefined, [], 'metadata', 1, {userID: null}])(
      '[security-target][CAP-001] rejects malformed updates %j',
      data => {
        const dispatch = jest.fn();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        try {
          updateAccountData(generateUUID(), data)(dispatch);
          expect(dispatch).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      },
    );
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

    it('[characterization][DCP-001] clears preserved unread state when the account becomes visible', async () => {
      const account = {...createAccount({visible: false}), badgeCount: 1};
      let state: State = {
        accounts: [account],
        contextMenuState: {accountId: '', isAtLeastAdmin: false, position: {centerX: 0, centerY: 0}},
      };
      const dispatch = jest.fn((action: Parameters<typeof accountReducer>[1]) => {
        state = {...state, accounts: accountReducer(state.accounts, action)};
        return action;
      });
      const sendBadgeCount = jest.fn();
      window.blur = jest.fn();
      window.focus = jest.fn();
      window.sendBadgeCount = sendBadgeCount;
      const webview = document.createElement('div');
      webview.className = 'Webview';
      webview.dataset.accountid = account.id;
      document.body.replaceChildren(webview);

      await new AccountAction().switchWebview(0)(dispatch as unknown as AppDispatch, () => state);

      expect(state.accounts[0]).toMatchObject({badgeCount: 0, visible: true});
      expect(sendBadgeCount).toHaveBeenCalledWith(0, false);
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
