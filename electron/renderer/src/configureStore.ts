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

export const configureStore = async (thunkArguments: Object) => {
  const accounts = await window.wireAccounts.read();
  const store = createStore(reducers, {accounts: [...accounts], contextMenuState}, createMiddleware(thunkArguments));
  window.wireAccounts.subscribe(accounts => store.dispatch({type: 'SYNC_ACCOUNTS', accounts: [...accounts]}));
  return store;
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
