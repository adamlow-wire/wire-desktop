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

import {act} from 'react';

import {createRoot, Root} from 'react-dom/client';
import {Provider} from 'react-redux';
import {createStore} from 'redux';

import Sidebar from './Sidebar';

import type {Account} from '../../types/account';

jest.mock('./Sidebar.css', () => ({}));
jest.mock('../AccountIcon', () => ({AccountIcon: () => null}));
jest.mock('../../lib/locale', () => ({getText: (key: string) => key}));
jest.mock('../../../../src/settings/config', () => ({config: {maximumAccounts: 3}}));

describe('[regression][CAP-001] named sidebar controls', () => {
  let root: Root;
  let container: HTMLDivElement;
  let contextMenu: jest.Mock;
  let add: jest.Mock;
  const accounts: Account[] = ['first', 'second'].map((name, index) => ({
    id: `desktop-${name}`,
    userID: `webapp-${name}`,
    accountIndex: index,
    badgeCount: 0,
    darkMode: false,
    isAdding: false,
    teamRole: 'member',
    visible: index === 0,
    name,
  }));
  const cells = () => [...container.querySelectorAll<HTMLElement>('[data-uie-name="account-cell"]')];

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    contextMenu = jest.fn().mockResolvedValue(undefined);
    add = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'wireAccounts', {configurable: true, value: {contextMenu, add}});
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const store = createStore(() => ({accounts}));
    act(() =>
      root.render(
        <Provider store={store}>
          <Sidebar />
        </Provider>,
      ),
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
    Reflect.deleteProperty(window, 'wireAccounts');
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('targets the desktop account ID and restores keyboard focus only after the native menu closes', async () => {
    const [first, second] = cells();
    for (const key of ['ContextMenu', 'F10']) {
      let close!: () => void;
      contextMenu.mockReturnValueOnce(new Promise<void>(resolve => (close = resolve)));
      first.focus();
      const event = new KeyboardEvent('keydown', {key, shiftKey: key === 'F10', bubbles: true, cancelable: true});
      act(() => second.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(contextMenu).toHaveBeenLastCalledWith(accounts[1].id);
      expect(document.activeElement).toBe(first);
      await act(async () => close());
      expect(document.activeElement).toBe(second);
    }
  });

  it('does not steal mouse focus or restore focus to a removed account', async () => {
    const [first, second] = cells();
    first.focus();
    await act(async () => second.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true})));
    expect(contextMenu).toHaveBeenLastCalledWith(accounts[1].id);
    expect(document.activeElement).toBe(first);
    let close!: () => void;
    contextMenu.mockReturnValueOnce(new Promise<void>(resolve => (close = resolve)));
    act(() => second.dispatchEvent(new KeyboardEvent('keydown', {key: 'ContextMenu', bubbles: true})));
    const focus = jest.spyOn(second, 'focus');
    second.remove();
    await act(async () => close());
    expect(focus).not.toHaveBeenCalled();
  });

  it('uses the named add control and reports rejected native actions', async () => {
    const failure = new Error('Native action failed');
    add.mockRejectedValue(failure);
    await act(async () => container.querySelector<HTMLElement>('[data-uie-name="do-open-plus-menu"]')!.click());
    expect(add).toHaveBeenCalledWith();
    expect(console.error).toHaveBeenCalledWith(failure);
    contextMenu.mockRejectedValue(failure);
    const cell = cells()[0];
    await act(async () => cell.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true})));
    expect(contextMenu).toHaveBeenCalledWith(accounts[0].id);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
