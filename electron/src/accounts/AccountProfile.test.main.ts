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

import {stub} from 'sinon';

import {strict as assert} from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {AccountProfile, parseLegacyAccounts} from './AccountProfile';
import {AccountState} from './AccountState';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
const partition = '33333333-3333-4333-8333-333333333333';
const legacy = () => ({
  accounts: [
    {id: ids[0], visible: true, name: 'First', userID: ids[0], webappUrl: 'https://example.com'},
    {
      id: ids[1],
      sessionID: partition,
      visible: false,
      name: 'Second',
      userID: ids[1],
      webappUrl: 'https://other.example.com',
    },
  ],
});

describe('main-owned account profile', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-account-profile-'));
  });
  afterEach(() => {
    fs.rmSync(directory, {recursive: true, force: true});
  });

  it('[CAP-001] preserves legacy account IDs, session mappings, metadata and selection', () => {
    const accounts = parseLegacyAccounts(JSON.stringify(legacy()), 3);
    assert.equal(accounts[0].id, ids[0]);
    assert.equal(accounts[0].sessionID, undefined);
    assert.equal(accounts[1].sessionID, partition);
    assert.deepEqual(
      accounts.map(account => account.visible),
      [true, false],
    );
    assert.deepEqual(
      accounts.map(account => account.name),
      ['First', 'Second'],
    );
  });

  it('[CAP-001] commits a one-time import without ever replacing it with stale legacy state', () => {
    const profile = new AccountProfile(path.join(directory, 'accounts-v1.json'), 3);
    assert.equal(profile.read(), undefined);
    const accounts = profile.importLegacy(JSON.stringify(legacy()));
    profile.write(accounts.map(account => ({...account, name: 'Updated', badgeCount: 7, lifecycle: 'signed-in'})));
    const reloaded = new AccountProfile(path.join(directory, 'accounts-v1.json'), 3);
    assert.deepEqual(reloaded.importLegacy('invalid ignored legacy data'), reloaded.read());
    assert.deepEqual(
      reloaded.read()!.map(account => account.name),
      ['Updated', 'Updated'],
    );
    assert.deepEqual(
      reloaded.read()!.map(account => account.badgeCount),
      [0, 0],
    );
    assert.equal(reloaded.read()![0].lifecycle, undefined);
    assert.deepEqual(fs.readdirSync(directory), ['accounts-v1.json']);
  });

  it('[migration][CAP-001] preserves pending non-federated join links without inventing a domain', () => {
    for (const data of [
      {code: 'code', key: 'key'},
      {code: 'code', key: 'key', domain: null},
    ]) {
      const accounts = parseLegacyAccounts(JSON.stringify({accounts: [{id: ids[0], conversationJoinData: data}]}), 3);
      assert.deepEqual(accounts[0].conversationJoinData, data);
    }
  });

  it('[migration][CAP-001] reloads main-owned selection and new partitions without reimporting stale state', () => {
    const filename = path.join(directory, 'accounts-v1.json');
    const profile = new AccountProfile(filename, 3);
    const owner = new AccountState(profile.importLegacy(JSON.stringify(legacy())), 3, records =>
      profile.write(records),
    );
    const added = owner.add();
    const newPartition = owner.get(added).sessionID;
    owner.select(ids[1]);
    const reopened = new AccountProfile(filename, 3);
    const restored = new AccountState(reopened.importLegacy(JSON.stringify(legacy())), 3, records =>
      reopened.write(records),
    );
    assert.equal(restored.snapshots().length, 3);
    assert.equal(restored.get(added).sessionID, newPartition);
    assert.equal(restored.get(ids[0]).sessionID, undefined);
    assert.equal(restored.get(ids[1]).sessionID, partition);
    assert.deepEqual(
      restored.snapshots().map(account => account.visible),
      [false, true, false],
    );
  });

  it('[security-target][CAP-001] rejects duplicate identities and shared legacy partitions', () => {
    const duplicateId = legacy();
    duplicateId.accounts[1].id = ids[0];
    assert.throws(() => parseLegacyAccounts(JSON.stringify(duplicateId), 3));
    const duplicateSession = legacy();
    delete duplicateSession.accounts[1].sessionID;
    assert.throws(() => parseLegacyAccounts(JSON.stringify(duplicateSession), 3));
  });

  it('[security-target][CAP-001] rejects case-aliased partitions that would share Windows storage', () => {
    const value = legacy();
    value.accounts[0].sessionID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    value.accounts[1].sessionID = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
    assert.throws(() => parseLegacyAccounts(JSON.stringify(value), 3));
  });

  it('[security-target][CAP-001] preserves the last profile and removes its temporary file on rename failure', () => {
    const filename = path.join(directory, 'accounts-v1.json');
    const profile = new AccountProfile(filename, 3);
    const accounts = profile.importLegacy(JSON.stringify(legacy()));
    const saved = fs.readFileSync(filename, 'utf8');
    const rename = stub(fs, 'renameSync').throws(new Error('Rename failed'));
    try {
      assert.throws(
        () => profile.write(accounts.map(account => ({...account, name: 'Not committed'}))),
        /Rename failed/,
      );
      assert.equal(fs.readFileSync(filename, 'utf8'), saved);
      assert.deepEqual(fs.readdirSync(directory), ['accounts-v1.json']);
    } finally {
      rename.restore();
    }
  });

  it('[security-target][CAP-001] rejects oversized saved profiles without reimporting legacy data', () => {
    const filename = path.join(directory, 'accounts-v1.json');
    fs.writeFileSync(filename, ' '.repeat(2 * 1024 * 1024 + 1));
    assert.throws(() => new AccountProfile(filename, 3).importLegacy(JSON.stringify(legacy())), /size limit/);
  });

  it('[CAP-001] selects the first valid account when an old profile has no selection', () => {
    const value = legacy();
    value.accounts[0].visible = false;
    assert.deepEqual(
      parseLegacyAccounts(JSON.stringify(value), 3).map(account => account.visible),
      [true, false],
    );
  });

  for (const value of [
    '{',
    '{}',
    '{"accounts":{}}',
    JSON.stringify({accounts: [{id: '../outside'}]}),
    JSON.stringify({accounts: [{id: ids[0], sessionID: '../outside'}]}),
    JSON.stringify({accounts: [{id: ids[0], webappUrl: 'file:///secret'}]}),
    JSON.stringify({accounts: [{id: ids[0], webappUrl: 'https://user:password@example.com'}]}),
    JSON.stringify({accounts: [{id: ids[0], name: 42}]}),
    JSON.stringify({accounts: [{id: ids[0], visible: 'true'}]}),
  ]) {
    it(`[security-target][CAP-001] refuses malformed legacy data ${value.slice(0, 70)}`, () => {
      const profile = new AccountProfile(path.join(directory, 'accounts-v1.json'), 3);
      assert.throws(() => profile.importLegacy(value));
      assert.deepEqual(fs.readdirSync(directory), []);
    });
  }

  it('[security-target][CAP-001] bounds size/count and rejects ambiguous active selections', () => {
    assert.throws(() => parseLegacyAccounts(' '.repeat(2 * 1024 * 1024 + 1), 3));
    assert.throws(() => parseLegacyAccounts(JSON.stringify(legacy()), 1));
    const value = legacy();
    value.accounts[1].visible = true;
    assert.throws(() => parseLegacyAccounts(JSON.stringify(value), 3));
  });

  it('[security-target][CAP-001] never discards a corrupt or unknown-version main profile', () => {
    const filename = path.join(directory, 'accounts-v1.json');
    const profile = new AccountProfile(filename, 3);
    for (const value of ['broken', '{"version":2,"accounts":[]}']) {
      fs.writeFileSync(filename, value);
      assert.throws(() => profile.importLegacy(JSON.stringify(legacy())));
      assert.equal(fs.readFileSync(filename, 'utf8'), value);
    }
  });

  it('[CAP-001] retains an empty profile and ignores unknown legacy metadata keys', () => {
    assert.deepEqual(parseLegacyAccounts('{"accounts":[]}', 3), []);
    const profile = new AccountProfile(path.join(directory, 'accounts-v1.json'), 3);
    profile.write([]);
    assert.deepEqual(profile.importLegacy(JSON.stringify(legacy())), []);
    const value = legacy();
    Object.assign(value.accounts[0], {untrustedProperty: 'ignored'});
    const accounts = parseLegacyAccounts(JSON.stringify(value), 3);
    assert.equal(Object.hasOwn(accounts[0], 'untrustedProperty'), false);
  });

  it('[security-target][CAP-001] preserves the previous profile when a durable write fails', () => {
    const filename = path.join(directory, 'accounts-v1.json');
    const profile = new AccountProfile(filename, 3);
    const accounts = profile.importLegacy(JSON.stringify(legacy()));
    const saved = fs.readFileSync(filename, 'utf8');
    const sync = stub(fs, 'fsyncSync').throws(new Error('Storage unavailable'));
    try {
      assert.throws(() => profile.write(accounts), /Storage unavailable/);
      assert.equal(fs.readFileSync(filename, 'utf8'), saved);
      assert.deepEqual(fs.readdirSync(directory), ['accounts-v1.json']);
    } finally {
      sync.restore();
    }
  });

  it('[security-target][CAP-001] never treats unreadable storage as a fresh profile', () => {
    const read = stub(fs, 'statSync').throws(Object.assign(new Error('Access denied'), {code: 'EACCES'}));
    try {
      assert.throws(() => new AccountProfile(path.join(directory, 'accounts-v1.json'), 3).read(), /Access denied/);
    } finally {
      read.restore();
    }
  });

  it('[security-target][CAP-001] bounds the serialized collection before touching the previous file', () => {
    const filename = path.join(directory, 'accounts-v1.json');
    const profile = new AccountProfile(filename, 3);
    const accounts = profile.importLegacy(JSON.stringify(legacy()));
    const saved = fs.readFileSync(filename, 'utf8');
    assert.throws(
      () => profile.write(accounts.map(account => ({...account, picture: 'x'.repeat(1024 * 1024)}))),
      /size limit/,
    );
    assert.equal(fs.readFileSync(filename, 'utf8'), saved);
    assert.deepEqual(fs.readdirSync(directory), ['accounts-v1.json']);
  });
});
