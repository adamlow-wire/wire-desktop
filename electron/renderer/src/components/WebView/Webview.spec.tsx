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

import {StyledApp, THEME_ID} from '@wireapp/react-ui-kit';

import Webview from './Webview';

import type {Account} from '../../types/account';

jest.mock('./Webview.css', () => ({}));
jest.mock('../LoadingSpinner/LoadingSpinner.css', () => ({}));
jest.mock('../../lib/locale', () => ({getText: (key: string) => key}));

describe('[regression][CAP-001] native account shell slot', () => {
  const account: Account = {
    id: '11111111-1111-4111-8111-111111111111',
    accountIndex: 0,
    badgeCount: 0,
    darkMode: true,
    isAdding: false,
    teamRole: 'member',
    visible: true,
    userID: 'owner',
    webappUrl: 'https://wire.test/',
  };
  let root: Root;
  let container: HTMLDivElement;
  let sidebar: HTMLDivElement;
  let layout: jest.Mock;
  let remove: jest.Mock;
  let reload: jest.Mock;
  const render = (overrides: Partial<Account> = {}) => {
    act(() =>
      root.render(
        <StyledApp themeId={THEME_ID.DEFAULT}>
          <Webview account={{...account, ...overrides}} />
        </StyledApp>,
      ),
    );
  };

  beforeEach(() => {
    jest.useFakeTimers();
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    history.replaceState({}, '', '/');
    layout = jest.fn().mockResolvedValue(undefined);
    remove = jest.fn().mockResolvedValue(undefined);
    reload = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'wireAccounts', {configurable: true, value: {layout, remove, reload}});
    sidebar = document.createElement('div');
    sidebar.className = 'Sidebar';
    jest.spyOn(sidebar, 'getBoundingClientRect').mockReturnValue({width: 78} as DOMRect);
    container = document.createElement('div');
    document.body.append(sidebar, container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sidebar.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    Reflect.deleteProperty(window, 'wireAccounts');
  });

  it('sizes only the selected native account and reserves cancellation chrome', async () => {
    render({visible: false});
    expect(layout).not.toHaveBeenCalled();
    render();
    expect(layout).toHaveBeenLastCalledWith(78, 0);
    expect(container.querySelector('webview')).toBeNull();
    render({canCancel: true});
    expect(layout).toHaveBeenLastCalledWith(78, 56);
    await act(async () => container.querySelector<HTMLElement>('[data-uie-name="do-close-webview"]')!.click());
    expect(remove).toHaveBeenCalledWith(account.id);
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows account failures and retries only that account through the named bridge', async () => {
    render({loadError: 'Account loading failed.'});
    expect(container.querySelector('[data-uie-name="status-webview-error"]')).not.toBeNull();
    expect(container.textContent).toContain('Account loading failed.');
    const retry = [...container.querySelectorAll<HTMLElement>('*')].find(
      element => element.textContent === 'webviewErrorRetryAction' && element.children.length === 0,
    )!;
    await act(async () => retry.click());
    expect(reload).toHaveBeenCalledWith(account.id);
    expect(remove).not.toHaveBeenCalled();
  });

  it('shows the configuration screen without creating renderer-owned remote content', () => {
    history.replaceState({}, '', '/?noUrlConfigured=true');
    render();
    expect(container.querySelector('[data-uie-name="status-no-url-configured"]')).not.toBeNull();
    expect(container.querySelector('webview')).toBeNull();
  });
});
