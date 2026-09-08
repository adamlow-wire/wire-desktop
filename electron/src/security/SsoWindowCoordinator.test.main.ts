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

import * as assert from 'assert';

import {SsoWindowCoordinator} from './SsoWindowCoordinator';

describe('SSO window coordinator [security-target][INV-005][SEC-008]', () => {
  const fixture = (owner = 'account-a') => ({
    closes: 0,
    focuses: 0,
    init: async () => {},
    close() {
      this.closes++;
    },
    focus() {
      this.focuses++;
    },
    isOwnedByAccount: (accountId: string) => accountId === owner,
    onClose: () => {},
  });

  it('requires an owner and reserves the active flow before initialization completes', async () => {
    let created = 0;
    let initialized!: () => void;
    const window = fixture();
    window.init = () =>
      new Promise<void>(resolve => {
        initialized = resolve;
      });
    const create = () => {
      created++;
      return window;
    };
    const coordinator = new SsoWindowCoordinator(() => {});
    await coordinator.open(undefined, create);
    coordinator.control(undefined, 'close');
    assert.strictEqual(created, 0);
    const opening = coordinator.open('account-a', create);
    await coordinator.open('account-b', create);
    assert.strictEqual(created, 1);
    assert.strictEqual(window.focuses, 0);
    await coordinator.open('account-a', create);
    assert.strictEqual(window.focuses, 1);
    initialized();
    await opening;
  });

  it('rejects cross-account controls and waits for completed cleanup before another flow', async () => {
    let closed = 0;
    let created = 0;
    const window = fixture();
    const coordinator = new SsoWindowCoordinator(() => {
      closed++;
    });
    const create = () => {
      created++;
      return window;
    };
    await coordinator.open('account-a', create);
    coordinator.control('account-b', 'close');
    coordinator.control(undefined, 'focus');
    assert.strictEqual(window.closes, 0);
    assert.strictEqual(window.focuses, 0);
    coordinator.control('account-a', 'close');
    assert.strictEqual(window.closes, 1);
    await coordinator.open('account-b', create);
    assert.strictEqual(created, 1, 'cleanup is still pending');
    window.onClose();
    assert.strictEqual(closed, 1);
    const next = fixture('account-b');
    await coordinator.open('account-b', () => next);
    window.onClose();
    assert.strictEqual(closed, 1, 'a stale close must not retire the next flow');
    coordinator.control('account-b', 'focus');
    assert.strictEqual(next.focuses, 1);
    next.onClose();
    assert.strictEqual(closed, 2);
  });

  it('closes failed initialization and reports the original error', async () => {
    const failure = new Error('controlled initialization failure');
    const window = fixture();
    window.init = async () => {
      throw failure;
    };
    const coordinator = new SsoWindowCoordinator(() => {});
    await assert.rejects(
      coordinator.open('account-a', () => window),
      error => error === failure,
    );
    assert.strictEqual(window.closes, 1);
    window.onClose();
    const next = fixture();
    await coordinator.open('account-a', () => next);
    coordinator.control('account-a', 'focus');
    assert.strictEqual(next.focuses, 1);
  });
});
