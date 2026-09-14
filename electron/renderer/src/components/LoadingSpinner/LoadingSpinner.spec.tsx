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

import {LoadingSpinner} from './LoadingSpinner';

jest.mock('./LoadingSpinner.css', () => ({}));

describe('[regression][CAP-001] native account loading indicator', () => {
  let container: HTMLDivElement;
  let root: Root;
  const render = (visible: boolean, isLoading: boolean) => {
    act(() => root.render(<LoadingSpinner visible={visible} isLoading={isLoading} />));
  };
  const spinner = () => container.querySelector<HTMLElement>('[data-uie-name="loading-spinner-wrapper"]');

  beforeEach(() => {
    jest.useFakeTimers();
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('shows only the selected loading account and fades before removal', () => {
    render(false, true);
    expect(spinner()).toBeNull();
    render(true, true);
    expect(spinner()!.style.opacity).toBe('1');
    expect(spinner()!.style.pointerEvents).toBe('all');
    render(true, false);
    expect(spinner()!.style.opacity).toBe('0');
    expect(spinner()!.style.pointerEvents).toBe('none');
    act(() => jest.advanceTimersByTime(499));
    expect(spinner()).not.toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(spinner()).toBeNull();
  });

  it('cancels stale fade timers when loading restarts and can show again after completion', () => {
    render(true, false);
    act(() => jest.advanceTimersByTime(250));
    render(true, true);
    act(() => jest.advanceTimersByTime(500));
    expect(spinner()!.style.opacity).toBe('1');
    render(true, false);
    act(() => jest.advanceTimersByTime(500));
    expect(spinner()).toBeNull();
    render(true, true);
    expect(spinner()!.style.opacity).toBe('1');
  });
});
