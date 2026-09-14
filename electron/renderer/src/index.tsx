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

import {createRoot} from 'react-dom/client';
import {Provider} from 'react-redux';
import {Action} from 'redux';

import actionRoot from './actions';
import App from './components/App/App';
import {configureStore} from './configureStore';
import './Index.css';
import {Account} from './types/account';
import {ContextMenuState} from './types/contextMenuState';

import {EVENT_TYPE} from '../../src/lib/eventType';

export type State = {
  accounts: Account[];
  contextMenuState: ContextMenuState;
};

export interface AppAction extends Action {
  type: string;
}

export type AppDispatch = Awaited<ReturnType<typeof configureStore>>['dispatch'];

const initialize = async (): Promise<void> => {
  const store = await configureStore({actions: actionRoot});
  window.addEventListener(EVENT_TYPE.ACTION.SWITCH_ACCOUNT, event => {
    const index = (event as CustomEvent<{accountIndex: number}>).detail.accountIndex;
    const account = store.getState().accounts[Math.max(index, 0)];
    if (account) {
      void window.wireAccounts.select(account.id).catch(console.error);
    }
  });
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('container not found.');
  }
  createRoot(container).render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
};
void initialize().catch(error => console.error('Unable to initialize account display.', error));
