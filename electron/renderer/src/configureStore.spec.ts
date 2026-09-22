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
import {createAccountShellBridge} from '../../src/preload/AccountShellBridge';

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
  let unsubscribe: jest.Mock;

  beforeEach(() => {
    read = jest.fn().mockResolvedValue(Object.freeze([Object.freeze({...account})]));
    unsubscribe = jest.fn();
    subscribe = jest.fn().mockReturnValue(unsubscribe);
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
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it('keeps a main push arriving between read completion and store initialization', async () => {
    let resolve!: (accounts: readonly AccountSnapshot[]) => void;
    let push!: (event: unknown, accounts: readonly AccountSnapshot[]) => void;
    const bridge = createAccountShellBridge({
      invoke: () =>
        new Promise<readonly AccountSnapshot[]>(done => {
          resolve = done;
        }),
      on: (_channel, listener) => {
        push = listener;
      },
    });
    Object.defineProperty(window, 'wireAccounts', {configurable: true, value: bridge});
    const initializing = configureStore({});
    resolve([account]);
    const newer = [{...account, name: 'Latest main state', badgeCount: 7}];
    queueMicrotask(() => push({}, newer));
    const store = await initializing;
    expect(store.getState().accounts).toEqual(newer);
    const subsequent = [{...account, name: 'Next main state', badgeCount: 8}];
    push({}, subsequent);
    expect(store.getState().accounts).toEqual(subsequent);
  });
  it('still rejects a failed bootstrap after receiving an update and releases its subscription', async () => {
    let reject!: (error: Error) => void;
    read.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const initializing = configureStore({});
    subscribe.mock.calls[0][0]([{...account, name: 'An update does not excuse a failed read'}]);
    const failure = new Error('Owned bootstrap failure.');
    reject(failure);
    await expect(initializing).rejects.toBe(failure);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
