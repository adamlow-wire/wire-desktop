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

import {strict as assert} from 'node:assert';

import {AccountController} from './AccountController';
import {AccountState} from './AccountState';
import type {AccountViews} from './AccountViews';

import {ACCOUNT_EVENT_CAPABILITY} from '../security/AccountEventContract';
import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

// The real controller/state/registry run without native windows or persistent user data.
const fixture = async () => {
  const state = new AccountState([], 3, () => undefined);
  const id = state.snapshots()[0].id;
  const sender = {
    id: 1,
    session: {},
    mainFrame: {url: 'https://account.example.test/'},
    isDestroyed: () => false,
    isLoading: () => false,
  };
  const registry = new ViewIdentityRegistry();
  const register = () =>
    registry.register({
      accountId: id,
      allowedOrigin: 'https://account.example.test',
      capabilities: [ACCOUNT_EVENT_CAPABILITY],
      partition: 'queue-fixture',
      session: sender.session,
      viewType: 'account',
      webContents: sender,
    });
  const identity = register();
  const published: Array<string | undefined> = [];
  let decline!: (error: Error) => void;
  const controller = new AccountController({
    state,
    registry,
    views: {has: () => true, get: () => sender} as unknown as AccountViews,
    destination: () => sender.mainFrame.url,
    session: () => {
      throw new Error('Unexpected session access.');
    },
    clearData: async () => {
      throw new Error('Unexpected data deletion.');
    },
    approveEnvironment: () =>
      new Promise((_resolve, reject) => {
        decline = reject;
      }),
    changed: () => published.push(state.get(id).name),
    badge: () => undefined,
    loaded: () => undefined,
    menu: async () => undefined,
    accountLimit: async () => undefined,
  });
  const pendingApproval = controller
    .receive(identity, {type: 'environment', url: 'https://other.example.test/'})
    .catch(error => {
      assert.equal(error.message, 'Synthetic approval cancelled.');
    });
  await Promise.resolve();
  assert.equal(typeof decline, 'function');
  const cancel = async () => {
    decline(new Error('Synthetic approval cancelled.'));
    await pendingApproval;
  };
  return {state, id, sender, registry, register, identity, controller, published, cancel};
};

describe('[CAP-001][INV-003][INV-010] account lifecycle queue', () => {
  it('retains ordered, copied account events across a cancelled environment approval', async () => {
    const {state, id, identity, controller, published, cancel} = await fixture();
    const message = {type: 'metadata' as const, data: {name: 'first'}};
    const first = controller.receive(identity, message);
    message.data.name = 'mutated after enqueue';
    const second = controller.receive(identity, {type: 'metadata', data: {name: 'second'}});
    try {
      await Promise.resolve();
      assert.deepEqual(published, []);
      assert.equal(state.get(id).name, undefined);
    } finally {
      await cancel();
      await Promise.all([first, second]);
    }
    assert.deepEqual(published, [undefined, 'first', 'second']);
    assert.equal(state.get(id).name, 'second');
  });

  it('rejects queued events whose sender loses authority before approval finishes', async () => {
    const {state, id, sender, registry, register, identity, controller, cancel} = await fixture();
    const queued = Array.from({length: 31}, () =>
      assert.rejects(
        controller.receive(identity, {type: 'metadata', data: {name: 'must not be published'}}),
        /View request is not authorized/,
      ),
    );
    registry.unregister(sender.id);
    await cancel();
    await Promise.all(queued);
    assert.equal(state.get(id).name, undefined);
    const replacement = register();
    await Promise.all(
      Array.from({length: 32}, (_, index) =>
        controller.receive(replacement, {type: 'metadata', data: {name: `replacement-${index}`}}),
      ),
    );
    assert.equal(state.get(id).name, 'replacement-31');
  });

  it('[security-target] bounds pending lifecycle work and recovers capacity after cancellation', async () => {
    const {state, id, identity, controller, cancel} = await fixture();
    // Contract: at most 32 active/queued operations, including the pending approval.
    const accepted = Array.from({length: 31}, (_, index) =>
      controller.receive(identity, {type: 'metadata', data: {name: `accepted-${index}`}}),
    );
    let overflowError: unknown;
    const overflow = controller
      .receive(identity, {type: 'metadata', data: {name: 'must not be queued'}})
      .catch(error => {
        overflowError = error;
      });
    try {
      await Promise.resolve();
      await Promise.resolve();
      assert.ok(overflowError instanceof Error, 'Overload must reject while consent is still pending.');
      assert.match(overflowError.message, /queue is full/i);
    } finally {
      await cancel();
      await Promise.all([...accepted, overflow]);
    }
    assert.equal(state.get(id).name, 'accepted-30');
    await controller.receive(identity, {type: 'metadata', data: {name: 'recovered'}});
    assert.equal(state.get(id).name, 'recovered');
  });
});
