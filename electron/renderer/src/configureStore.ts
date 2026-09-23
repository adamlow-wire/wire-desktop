/*
 * Wire
 * Copyright (C) 2020 Wire Swiss GmbH
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

import {applyMiddleware, createStore} from 'redux';
import {createLogger} from 'redux-logger';
import thunk from 'redux-thunk';

import reducers from './reducers';
import {initialState as contextMenuState} from './reducers/contextMenuReducer';

import type {AccountSnapshot} from '../../src/accounts/AccountState';

const createDisplayStore = (accounts: readonly AccountSnapshot[], thunkArguments: Object) =>
  createStore(reducers, {accounts: [...accounts], contextMenuState}, createMiddleware(thunkArguments));

export const configureStore = async (thunkArguments: Object) => {
  let store: ReturnType<typeof createDisplayStore> | undefined;
  let latest: readonly AccountSnapshot[] | undefined;
  // Subscribe before awaiting bootstrap so a newer main snapshot cannot fall into a gap.
  const unsubscribe = window.wireAccounts.subscribe(accounts => {
    latest = accounts;
    store?.dispatch({type: 'SYNC_ACCOUNTS', accounts: [...accounts]});
  });
  try {
    const accounts = await window.wireAccounts.read();
    store = createDisplayStore(latest ?? accounts, thunkArguments);
    return store;
  } catch (error) {
    unsubscribe();
    throw error;
  }
};

const createMiddleware = (thunkArguments: Object = {}) => {
  const middlewares = [];
  middlewares.push(thunk.withExtraArgument(thunkArguments));
  if (process.env.NODE_ENV !== 'production') {
    middlewares.push(
      createLogger({
        collapsed: true,
        diff: true,
        duration: true,
        level: {
          action: 'info',
          nextState: 'info',
          prevState: false,
        },
      }),
    );
  }
  return applyMiddleware(...middlewares);
};
