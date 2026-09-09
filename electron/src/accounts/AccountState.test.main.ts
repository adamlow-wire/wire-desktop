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

import {parseLegacyAccounts} from './AccountProfile';
import {AccountState} from './AccountState';

import {EVENT_TYPE} from '../lib/eventType';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const partition = '33333333-3333-4333-8333-333333333333';
const initial = () =>
  parseLegacyAccounts(
    JSON.stringify({
      accounts: [
        {id: ids[0], userID: ids[0], visible: true, name: 'First'},
        {id: ids[1], sessionID: partition, userID: ids[1], name: 'Second'},
      ],
    }),
    3,
  );

describe('main-owned account state', () => {
  it('[migration][CAP-001] applies guest metadata only to its owner while preserving legacy metadata semantics', () => {
    const records = initial();
    records[0].picture = 'old-first';
    records[0].webappUrl = 'https://custom.wire.test/';
    records[0].ssoCode = 'pending-secret';
    records[1].picture = 'old-second';
    const state = new AccountState(records, 3, () => undefined);
    const other = state.get(ids[1]);
    state.update(ids[0], {type: 'metadata', data: {name: 'Updated', userID: 'user', webappUrl: undefined}});
    const updated = state.get(ids[0]);
    assert.equal(updated.name, 'Updated');
    assert.equal(updated.userID, 'user');
    assert.equal(updated.isAdding, false);
    assert.equal(updated.ssoCode, undefined);
    assert.equal(updated.picture, undefined);
    assert.equal(updated.webappUrl, 'https://custom.wire.test/');
    assert.equal(updated.id, ids[0]);
    assert.equal(updated.sessionID, undefined);
    assert.deepEqual(state.get(ids[1]), other);
  });

  it('[migration][CAP-001] retains targeted lifecycle, theme, pending join and identity-reset behavior', () => {
    const state = new AccountState(initial(), 3, () => undefined);
    const other = state.get(ids[0]);
    state.update(ids[1], {type: 'loaded'});
    assert.equal(state.get(ids[1]).lifecycle, EVENT_TYPE.LIFECYCLE.SIGNED_IN);
    state.update(ids[1], {type: 'theme', theme: 'light'});
    assert.equal(state.get(ids[1]).darkMode, false);
    state.update(ids[1], {type: 'theme', theme: 'dark'});
    assert.equal(state.get(ids[1]).darkMode, true);
    state.update(ids[1], {type: 'join', code: 'code', key: 'key', domain: null});
    assert.deepEqual(state.get(ids[1]).conversationJoinData, {code: 'code', key: 'key', domain: null});
    state.clearPendingJoin(ids[1]);
    assert.equal(state.get(ids[1]).conversationJoinData, undefined);
    state.update(ids[1], {type: 'sign-out'});
    assert.equal(state.get(ids[1]).lifecycle, EVENT_TYPE.LIFECYCLE.SIGN_OUT);
    state.resetIdentity(ids[1]);
    assert.equal(state.get(ids[1]).userID, undefined);
    assert.equal(state.get(ids[1]).teamID, undefined);
    assert.equal(state.get(ids[1]).sessionID, partition);
    assert.deepEqual(state.get(ids[0]), other);
  });

  it('[migration][CAP-001] ignores hidden unread decreases until selection clears only that badge', () => {
    const state = new AccountState(initial(), 3, () => undefined);
    state.update(ids[1], {type: 'unread', count: 5});
    state.update(ids[1], {type: 'unread', count: 2});
    assert.equal(state.get(ids[1]).badgeCount, 5);
    state.update(ids[0], {type: 'unread', count: 3});
    state.update(ids[0], {type: 'unread', count: 1});
    assert.equal(state.get(ids[0]).badgeCount, 1);
    state.select(ids[1]);
    assert.equal(state.get(ids[1]).badgeCount, 0);
    assert.equal(state.get(ids[0]).badgeCount, 1);
  });

  it('[migration][CAP-001] selects only the activating account and avoids writes for unchanged badges', () => {
    let writes = 0;
    const state = new AccountState(initial(), 3, () => {
      writes++;
    });
    state.update(ids[0], {type: 'unread', count: 0});
    assert.equal(writes, 0);
    state.update(ids[1], {type: 'activate'});
    assert.deepEqual(
      state.snapshots().map(account => account.visible),
      [false, true],
    );
    assert.equal(writes, 1);
  });

  it('[security-target][CAP-001] preserves all state when an event write fails and rejects unknown targets', () => {
    const state = new AccountState(initial(), 3, () => {
      throw new Error('Disk full');
    });
    const before = state.snapshots();
    assert.throws(() => state.update('unknown', {type: 'loaded'}), /Unknown/);
    assert.throws(() => state.update(ids[0], {type: 'metadata', data: {name: 'Lost'}}), /Disk full/);
    assert.throws(() => state.resetIdentity(ids[0]), /Disk full/);
    assert.deepEqual(state.snapshots(), before);
  });

  it('[migration][CAP-001] retains legacy identity and selection without exposing session or flow secrets', () => {
    const records = initial();
    records[0].ssoCode = 'private-flow';
    records[0].conversationJoinData = {code: 'code', key: 'key', domain: ''};
    const state = new AccountState(records, 3, () => undefined);
    assert.equal(state.get(ids[0]).sessionID, undefined);
    assert.equal(state.get(ids[1]).sessionID, partition);
    assert.deepEqual(
      state.snapshots().map(account => account.visible),
      [true, false],
    );
    for (const account of state.snapshots()) {
      assert.equal(Object.hasOwn(account, 'sessionID'), false);
      assert.equal(Object.hasOwn(account, 'ssoCode'), false);
      assert.equal(Object.hasOwn(account, 'conversationJoinData'), false);
      assert.equal(Object.isFrozen(account), true);
    }
    assert.equal(Object.isFrozen(state.snapshots()), true);
    records[0].name = 'External change';
    const copy = state.get(ids[0]);
    copy.name = 'External change';
    assert.equal(state.get(ids[0]).name, 'First');
  });

  it('[characterization][CAP-001] selects exactly one account and clears only its unread count', () => {
    const records = initial();
    records[0].badgeCount = 2;
    records[1].badgeCount = 5;
    const state = new AccountState(records, 3, () => undefined);
    state.select(ids[1]);
    assert.deepEqual(
      state.snapshots().map(account => account.visible),
      [false, true],
    );
    assert.deepEqual(
      state.snapshots().map(account => account.badgeCount),
      [2, 0],
    );
    assert.equal(state.get(ids[1]).sessionID, partition);
  });

  it('[characterization][CAP-001] adds isolated accounts and reuses an existing unbound account', () => {
    const state = new AccountState(initial(), 3, () => undefined);
    const added = state.add();
    assert.notEqual(added, state.get(added).sessionID);
    assert.match(state.get(added).sessionID!, /^[0-9a-f-]{36}$/);
    assert.notEqual(state.get(added).sessionID, partition);
    assert.deepEqual(
      state.snapshots().map(account => account.visible),
      [false, false, true],
    );
    state.select(ids[0]);
    assert.equal(state.add(), added);
    assert.equal(state.snapshots().length, 3);
    assert.equal(state.get(added).visible, true);
    assert.equal(state.snapshots()[2].canCancel, true);
  });

  it('[security-target][CAP-001] rejects unknown targets and the account limit without persistence', () => {
    let writes = 0;
    const state = new AccountState(initial(), 2, () => {
      writes++;
    });
    const before = state.snapshots();
    assert.throws(() => state.add(), /Maximum/);
    assert.throws(() => state.select('unknown'), /Unknown/);
    assert.throws(() => state.remove('unknown'), /Unknown/);
    assert.equal(writes, 0);
    assert.deepEqual(state.snapshots(), before);
  });

  it('[characterization][CAP-001] removal selects the last survivor and retains its session', () => {
    const state = new AccountState(initial(), 3, () => undefined);
    const added = state.add();
    state.remove(added);
    assert.deepEqual(
      state.snapshots().map(account => account.visible),
      [false, true],
    );
    assert.equal(state.get(ids[1]).sessionID, partition);
    state.remove(ids[1]);
    assert.equal(state.get(ids[0]).visible, true);
    assert.equal(state.get(ids[0]).sessionID, undefined);
  });

  it('[migration][CAP-001] empty profiles and last-account removal create fresh main-owned partitions', () => {
    const state = new AccountState([], 3, () => undefined);
    const first = state.snapshots()[0].id;
    const firstSession = state.get(first).sessionID;
    assert.ok(firstSession);
    assert.equal(state.snapshots()[0].canCancel, false);
    state.remove(first);
    const second = state.snapshots()[0].id;
    assert.notEqual(second, first);
    assert.notEqual(state.get(second).sessionID, firstSession);
  });

  it('[security-target][CAP-001] never publishes a failed persistent transition', () => {
    const state = new AccountState(initial(), 3, () => {
      throw new Error('Disk full');
    });
    const before = state.snapshots();
    assert.throws(() => state.select(ids[1]), /Disk full/);
    assert.throws(() => state.add(), /Disk full/);
    assert.throws(() => state.remove(ids[0]), /Disk full/);
    assert.deepEqual(state.snapshots(), before);
  });
});
