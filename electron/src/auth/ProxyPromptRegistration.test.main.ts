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
import {showRegisteredProxyPrompt} from './ProxyPromptRegistration';

describe('proxy prompt registration', () => {
  it('[security-target][INV-003][INV-010][CAP-005] correlates native close with the active prompt only', async () => {
    const coordinator = new ProxyPromptCoordinator();
    const events: string[] = [];
    let close: (() => void) | undefined;
    await showRegisteredProxyPrompt({
      actions: {
        cancel: () => void events.push('cancel'),
        submit: () => void events.push('submit'),
      },
      coordinator,
      fireAndForget: action => void action(),
      showWindow: async onCreated => {
        close = onCreated(101);
      },
    });

    assert.strictEqual(coordinator.has(101), true);
    close?.();
    await Promise.resolve();
    assert.deepStrictEqual(events, ['cancel']);
    assert.strictEqual(coordinator.has(101), false);

    close?.();
    assert.deepStrictEqual(events, ['cancel']);
  });

  it('[security-target][INV-003][INV-010][CAP-005] does not cancel a successfully submitted prompt on close', async () => {
    const coordinator = new ProxyPromptCoordinator();
    const events: string[] = [];
    let close: (() => void) | undefined;
    await showRegisteredProxyPrompt({
      actions: {
        cancel: () => void events.push('cancel'),
        submit: () => void events.push('submit'),
      },
      coordinator,
      fireAndForget: action => void action(),
      showWindow: async onCreated => {
        close = onCreated(101);
      },
    });

    await coordinator.submit(101, {password: '', username: ''});
    close?.();

    assert.deepStrictEqual(events, ['submit']);
  });
});
