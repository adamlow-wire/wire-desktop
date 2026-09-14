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

import {EVENT_TYPE} from '../../src/lib/eventType';

jest.mock('react-dom/client', () => ({createRoot: jest.fn()}));
jest.mock('./configureStore', () => ({configureStore: jest.fn()}));
jest.mock('./components/App/App', () => ({__esModule: true, default: () => null}));
jest.mock('./actions', () => ({__esModule: true, default: {}}));
jest.mock('./Index.css', () => ({}));

describe('[regression][CAP-001] account display bootstrap', () => {
  let accounts: {id: string}[];
  let configure: jest.Mock;
  let createRoot: jest.Mock;
  let render: jest.Mock;
  let select: jest.Mock;
  let root: HTMLElement;
  let store: {getState: () => {accounts: {id: string}[]}};
  let addListener: jest.SpyInstance;
  const initialize = async () => {
    await import('./index');
    await Promise.resolve();
  };
  const switchAccount = (accountIndex: number) =>
    window.dispatchEvent(new CustomEvent(EVENT_TYPE.ACTION.SWITCH_ACCOUNT, {detail: {accountIndex}}));

  beforeEach(() => {
    jest.resetModules();
    accounts = [{id: 'first'}, {id: 'second'}];
    store = {getState: () => ({accounts})};
    configure = jest.requireMock('./configureStore').configureStore;
    configure.mockResolvedValue(store);
    createRoot = jest.requireMock('react-dom/client').createRoot;
    render = jest.fn();
    createRoot.mockReturnValue({render});
    select = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'wireAccounts', {configurable: true, value: {select}});
    root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);
    addListener = jest.spyOn(window, 'addEventListener');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const [name, listener] of addListener.mock.calls) {
      window.removeEventListener(name, listener);
    }
    root.remove();
    Reflect.deleteProperty(window, 'wireAccounts');
    jest.restoreAllMocks();
  });

  it('waits for the main-owned store before mounting and routes selections using the current snapshot', async () => {
    let resolveStore!: (value: typeof store) => void;
    configure.mockReturnValue(new Promise(resolve => (resolveStore = resolve)));
    await initialize();
    expect(createRoot).not.toHaveBeenCalled();
    switchAccount(1);
    expect(select).not.toHaveBeenCalled();
    resolveStore(store);
    await Promise.resolve();
    expect(createRoot).toHaveBeenCalledWith(root);
    expect(render.mock.calls[0][0].props.store).toBe(store);
    switchAccount(1);
    expect(select).toHaveBeenLastCalledWith('second');
    accounts = [{id: 'replacement'}];
    switchAccount(0);
    expect(select).toHaveBeenLastCalledWith('replacement');
    switchAccount(42);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('reports failed main bootstrap without installing account controls or mounting a fallback', async () => {
    const failure = new Error('Profile unavailable');
    configure.mockRejectedValue(failure);
    await initialize();
    expect(createRoot).not.toHaveBeenCalled();
    switchAccount(0);
    expect(select).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Unable to initialize account display.', failure);
  });

  it('reports a missing shell container without mounting', async () => {
    root.remove();
    await initialize();
    expect(createRoot).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Unable to initialize account display.', expect.any(Error));
  });

  it('reports rejected named selections', async () => {
    await initialize();
    const failure = new Error('Selection denied');
    select.mockRejectedValue(failure);
    switchAccount(0);
    await Promise.resolve();
    expect(console.error).toHaveBeenCalledWith(failure);
  });
});
