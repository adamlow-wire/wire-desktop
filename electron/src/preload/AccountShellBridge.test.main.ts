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

import {createAccountShellBridge} from './AccountShellBridge';

import {parseLegacyAccounts} from '../accounts/AccountProfile';
import {AccountState} from '../accounts/AccountState';
import {ACCOUNT_CONTROL_CHANNEL, ACCOUNT_SNAPSHOTS_CHANNEL} from '../security/AccountControlContract';

describe('account shell bridge', () => {
  const accountId = '11111111-1111-4111-8111-111111111111';
  const snapshots = () =>
    new AccountState(
      parseLegacyAccounts(JSON.stringify({accounts: [{id: accountId}]}), 3),
      3,
      () => undefined,
    ).snapshots();

  it('[security-target][CAP-001] exposes immutable named controls with exact fixed-channel payloads', async () => {
    const calls: unknown[] = [];
    const bridge = createAccountShellBridge({
      invoke: async (channel, request) => {
        assert.equal(channel, ACCOUNT_CONTROL_CHANNEL);
        calls.push(request);
        return snapshots();
      },
      on: channel => assert.equal(channel, ACCOUNT_SNAPSHOTS_CHANNEL),
    });
    assert.equal(Object.isFrozen(bridge), true);
    assert.deepEqual(Object.keys(bridge).sort(), [
      'add',
      'contextMenu',
      'join',
      'layout',
      'logout',
      'read',
      'reload',
      'remove',
      'select',
      'subscribe',
    ]);
    assert.deepEqual(await bridge.read(), snapshots());
    await bridge.add();
    await bridge.select(accountId);
    await bridge.remove(accountId);
    await bridge.reload(accountId);
    await bridge.logout(accountId);
    await bridge.contextMenu(accountId);
    await bridge.layout(78, 56);
    for (const domain of [undefined, null, 'wire.test']) {
      await bridge.join(accountId, 'code', 'key', domain);
    }
    assert.deepEqual(calls, [
      {action: 'read'},
      {action: 'add'},
      ...['select', 'remove', 'reload', 'logout', 'context-menu'].map(action => ({action, accountId})),
      {action: 'layout', sidebarWidth: 78, headerHeight: 56},
      ...[undefined, null, 'wire.test'].map(domain => ({action: 'join', accountId, code: 'code', key: 'key', domain})),
    ]);
  });

  it('[regression][CAP-001] does not overwrite pushed state with a stale command response or expose its event', async () => {
    let push!: (event: unknown, accounts: ReturnType<typeof snapshots>) => void;
    let resolve!: (accounts: ReturnType<typeof snapshots>) => void;
    const bridge = createAccountShellBridge({
      invoke: () =>
        new Promise(done => {
          resolve = done;
        }),
      on: (_channel, listener) => {
        push = listener;
      },
    });
    const received: unknown[][] = [];
    const unsubscribe = bridge.subscribe((...args) => received.push(args));
    const pending = bridge.read();
    const newer = snapshots().map(account => ({...account, name: 'Newer state'}));
    push({sender: 'privileged event'}, newer);
    resolve(snapshots());
    assert.deepEqual(await pending, newer);
    assert.deepEqual(received, [[newer]]);
    unsubscribe();
    unsubscribe();
    push({}, snapshots());
    assert.deepEqual(received, [[newer]]);
  });

  it('[security-target][CAP-001] propagates failed commands without publishing a success snapshot', async () => {
    const received: unknown[] = [];
    const bridge = createAccountShellBridge({
      invoke: async () => {
        throw new Error('Denied');
      },
      on: () => undefined,
    });
    bridge.subscribe(accounts => received.push(accounts));
    await assert.rejects(bridge.remove(accountId), /Denied/);
    assert.deepEqual(received, []);
  });

  it('[regression][CAP-001] keeps other display subscribers working when one throws', async () => {
    const bridge = createAccountShellBridge({invoke: async () => snapshots(), on: () => undefined});
    const received: unknown[] = [];
    bridge.subscribe(() => {
      throw new Error('Display failed');
    });
    bridge.subscribe(accounts => received.push(accounts));
    await bridge.read();
    assert.deepEqual(received, [snapshots()]);
  });
});
