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

import {configureStore} from './configureStore';

import type {AccountSnapshot} from '../../src/accounts/AccountState';

describe('[security-target][CAP-001] main-owned account display store', () => {
  const account: AccountSnapshot = {
    id: '11111111-1111-4111-8111-111111111111',
    accountIndex: 0,
    badgeCount: 0,
    darkMode: true,
    isAdding: false,
    teamRole: 'member',
    visible: true,
    canCancel: false,
  };
  let read: jest.Mock;
  let subscribe: jest.Mock;

  beforeEach(() => {
    read = jest.fn().mockResolvedValue(Object.freeze([Object.freeze({...account})]));
    subscribe = jest.fn();
    Object.defineProperty(window, 'wireAccounts', {configurable: true, value: {read, subscribe}});
    localStorage.setItem('state', JSON.stringify({accounts: [{...account, id: 'renderer-selected-identity'}]}));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    Reflect.deleteProperty(window, 'wireAccounts');
  });

  it('uses only main snapshots and never writes them back to renderer persistence', async () => {
    const save = jest.spyOn(Storage.prototype, 'setItem');
    const store = await configureStore({});
    expect(read).toHaveBeenCalledTimes(1);
    expect(store.getState().accounts).toEqual([account]);
    expect(subscribe).toHaveBeenCalledTimes(1);
    const updated = Object.freeze([Object.freeze({...account, name: 'Main update', badgeCount: 2})]);
    subscribe.mock.calls[0][0](updated);
    expect(store.getState().accounts).toEqual(updated);
    expect(store.getState().accounts).not.toBe(updated);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects failed bootstrap instead of falling back to stale renderer-owned accounts', async () => {
    read.mockRejectedValue(new Error('Account profile unavailable'));
    await expect(configureStore({})).rejects.toThrow('Account profile unavailable');
    expect(subscribe).not.toHaveBeenCalled();
  });
});
