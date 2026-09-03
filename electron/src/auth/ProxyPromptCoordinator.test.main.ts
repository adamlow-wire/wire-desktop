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

import {strict as assert} from 'assert';

import {ProxyPromptCoordinator} from './ProxyPromptCoordinator';

describe('ProxyPromptCoordinator', () => {
  it('[characterization][security-target][INV-003][INV-010][CAP-005] consumes exactly the submitting prompt', async () => {
    const coordinator = new ProxyPromptCoordinator();
    const calls: unknown[] = [];
    coordinator.register(101, {
      cancel: () => calls.push('cancel-101'),
      submit: credentials => calls.push(credentials),
    });
    coordinator.register(102, {
      cancel: () => calls.push('cancel-102'),
      submit: credentials => calls.push(credentials),
    });

    await coordinator.submit(101, {password: 'secret', username: 'proxy-user'});

    assert.deepStrictEqual(calls, [{password: 'secret', username: 'proxy-user'}]);
    assert.strictEqual(coordinator.has(101), false);
    assert.strictEqual(coordinator.has(102), true);
    await assert.rejects(() => coordinator.submit(101, {password: '', username: ''}), /not active/);
  });

  it('[characterization][security-target][INV-003][INV-010][CAP-005] consumes cancellation once', async () => {
    const coordinator = new ProxyPromptCoordinator();
    let cancellations = 0;
    coordinator.register(101, {
      cancel: () => void (cancellations += 1),
      submit: () => {},
    });

    await coordinator.cancel(101);

    assert.strictEqual(cancellations, 1);
    await assert.rejects(() => coordinator.cancel(101), /not active/);
  });

  it('[security-target][INV-010][CAP-005] restores a failed action for an explicit retry', async () => {
    const coordinator = new ProxyPromptCoordinator();
    const controlledFailure = new Error('controlled failure');
    coordinator.register(101, {
      cancel: () => Promise.reject(controlledFailure),
      submit: () => {},
    });

    await assert.rejects(() => coordinator.cancel(101), controlledFailure);
    assert.strictEqual(coordinator.has(101), true);
  });

  it('[security-target][INV-003][INV-010] rejects invalid and duplicate registrations', () => {
    const coordinator = new ProxyPromptCoordinator();
    const actions = {cancel: () => {}, submit: () => {}};
    assert.throws(() => coordinator.register(0, actions), /cannot be registered/);
    coordinator.register(101, actions);
    assert.throws(() => coordinator.register(101, actions), /cannot be registered/);
  });
});
