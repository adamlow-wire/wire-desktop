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

import {AccountController, AccountControllerOptions} from './AccountController';
import {AccountState} from './AccountState';
import type {AccountViews} from './AccountViews';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return {promise, resolve};
};

// Real controller/state with owned inert sessions and views; no Electron process.
const fixture = () => {
  const records = [true, false].map(visible => {
    const initial = new AccountState([], 3, () => undefined);
    return {...initial.get(initial.snapshots()[0].id), visible};
  });
  const [target, survivor] = records;
  const calls: string[] = [];
  const failure = new Error('Synthetic removal stage failure.');
  let failAt = '';
  const state = new AccountState(records, 3, () => {
    calls.push('persist');
    if (failAt === 'persist') {
      throw failure;
    }
  });
  const targetSession = {};
  const survivorSession = {};
  const live = new Map(
    records.map(record => [
      record.id,
      {
        session: record.id === target.id ? targetSession : survivorSession,
        isLoading: () => false,
      },
    ]),
  );
  const options: AccountControllerOptions = {
    state,
    registry: new ViewIdentityRegistry(),
    views: {
      has: (id: string) => live.has(id),
      get: (id: string) => {
        assert.ok(live.has(id));
        return live.get(id);
      },
      close: async (id: string) => {
        assert.equal(id, target.id);
        calls.push('close');
        if (failAt === 'close') {
          throw failure;
        }
        live.delete(id);
      },
      select: (id: string) => {
        assert.equal(id, survivor.id);
        calls.push('select');
      },
    } as unknown as AccountViews,
    destination: () => {
      throw new Error('Unexpected destination access.');
    },
    session: account => {
      assert.equal(account.id, target.id);
      calls.push('session');
      return targetSession as ReturnType<AccountControllerOptions['session']>;
    },
    clearData: async (account, session) => {
      calls.push('clear');
      assert.equal(account.id, target.id);
      assert.equal(session, targetSession);
      assert.equal(live.has(target.id), false);
      assert.equal(live.get(survivor.id)!.session, survivorSession);
      if (failAt === 'clear') {
        throw failure;
      }
    },
    approveEnvironment: async () => {
      throw new Error('Unexpected consent.');
    },
    changed: () => {
      calls.push('changed');
    },
    badge: () => {
      calls.push('badge');
    },
    loaded: () => undefined,
    menu: async () => undefined,
    accountLimit: async () => undefined,
  };
  return {
    controller: new AccountController(options),
    options,
    state,
    target,
    survivor,
    calls,
    failure,
    fail: (stage: string) => {
      failAt = stage;
    },
  };
};

describe('[CAP-001] controller removal failure recovery', () => {
  it('awaits owned view closure and data clearing before persisting removal', async () => {
    const {controller, options, state, target, survivor, calls} = fixture();
    const closeStarted = deferred();
    const closeRelease = deferred();
    const clearStarted = deferred();
    const clearRelease = deferred();
    const close = options.views.close.bind(options.views);
    const clear = options.clearData;
    options.views.close = async id => {
      closeStarted.resolve();
      await closeRelease.promise;
      await close(id);
    };
    options.clearData = async (account, session) => {
      clearStarted.resolve();
      await clearRelease.promise;
      await clear(account, session);
    };
    const removing = controller.remove(target.id);
    await closeStarted.promise;
    assert.deepEqual(calls, []);
    assert.equal(state.snapshots().length, 2);
    closeRelease.resolve();
    await clearStarted.promise;
    assert.deepEqual(calls, ['close']);
    assert.equal(state.snapshots().length, 2);
    clearRelease.resolve();
    await removing;
    assert.deepEqual(calls, ['close', 'clear', 'persist', 'select', 'badge', 'changed']);
    assert.deepEqual(
      state.snapshots().map(account => account.id),
      [survivor.id],
    );
  });

  for (const stage of ['close', 'clear', 'persist']) {
    it(`retains the record and exposes retry after ${stage} failure`, async () => {
      const {controller, state, target, survivor, calls, fail, failure} = fixture();
      fail(stage);
      await assert.rejects(controller.remove(target.id), error => error === failure);
      const beforeFailure = ['close', 'clear', 'persist'];
      assert.deepEqual(calls, [...beforeFailure.slice(0, beforeFailure.indexOf(stage) + 1), 'changed']);
      assert.deepEqual(
        state.snapshots().map(account => account.id),
        [target.id, survivor.id],
      );
      const snapshot = controller.snapshots().find(account => account.id === target.id)!;
      assert.equal(snapshot.removalFailed, true);
      assert.equal(snapshot.isLoading, false);
      fail('');
      calls.length = 0;
      await controller.remove(target.id);
      assert.deepEqual(calls, [
        ...(stage === 'close' ? [] : ['session']),
        'close',
        'clear',
        'persist',
        'select',
        'badge',
        'changed',
      ]);
      assert.deepEqual(
        state.snapshots().map(account => account.id),
        [survivor.id],
      );
      assert.equal(controller.snapshots()[0].visible, true);
      assert.equal(controller.snapshots()[0].removalFailed, false);
    });
  }
});
