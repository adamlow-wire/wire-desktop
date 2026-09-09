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
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink, access} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {deleteNativeAccountLogs} from './AccountLogCleanup';

describe('native account log cleanup', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  let directory: string;
  let logs: string;
  const put = async (file: string) => {
    await mkdir(path.dirname(file), {recursive: true});
    await writeFile(file, 'retained');
  };
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'wire-account-log-cleanup-'));
    logs = path.join(directory, 'logs');
    await mkdir(logs);
  });
  afterEach(async () => {
    await rm(directory, {recursive: true, force: true});
  });

  it('[security-target][CAP-001] deletes only exact account layouts and supports repeated cleanup', async () => {
    const targets = [
      path.join(logs, id),
      path.join(logs, '2099-01-01', 'accounts', id),
      path.join(logs, `2_2099_01_01_12_34_56_${id}`),
    ];
    const kept = [
      path.join(logs, '2099-01-01', 'electron.log'),
      path.join(logs, '2099-01-01', 'accounts', other, 'console.log'),
      path.join(logs, `${id}-suffix`, 'console.log'),
    ];
    for (const target of targets) {
      await put(path.join(target, 'console.log'));
    }
    for (const file of kept) {
      await put(file);
    }
    await deleteNativeAccountLogs(id, logs);
    for (const target of targets) {
      await assert.rejects(access(target), {code: 'ENOENT'});
    }
    for (const file of kept) {
      assert.equal(await readFile(file, 'utf8'), 'retained');
    }
    await deleteNativeAccountLogs(id, logs);
  });

  for (const kind of ['root', 'ancestor', 'target'] as const) {
    it(`[security-target][CAP-001] rejects a linked ${kind} without touching its target`, async () => {
      const outside = path.join(directory, 'outside');
      const sentinel = path.join(outside, 'accounts', id, 'console.log');
      await put(sentinel);
      const link = kind === 'root' ? logs : kind === 'ancestor' ? path.join(logs, '2099-01-01') : path.join(logs, id);
      if (kind === 'root') {
        await rm(logs, {recursive: true});
      }
      await symlink(outside, link, 'junction');
      await assert.rejects(deleteNativeAccountLogs(id, logs), /linked/);
      assert.equal(await readFile(sentinel, 'utf8'), 'retained');
    });
  }

  it('[security-target][CAP-001] removes nested links without following them outside the account', async () => {
    const sentinel = path.join(directory, 'outside', 'console.log');
    await put(sentinel);
    await mkdir(path.join(logs, id));
    await symlink(path.dirname(sentinel), path.join(logs, id, 'linked'), 'junction');
    await deleteNativeAccountLogs(id, logs);
    assert.equal(await readFile(sentinel, 'utf8'), 'retained');
  });

  it('[security-target][CAP-001] rejects invalid identities and non-directory roots', async () => {
    await assert.rejects(deleteNativeAccountLogs('../outside', logs), /Invalid account/);
    const file = path.join(directory, 'file');
    await put(file);
    await assert.rejects(deleteNativeAccountLogs(id, file), /Unsafe/);
    assert.equal(await readFile(file, 'utf8'), 'retained');
    await deleteNativeAccountLogs(id, path.join(directory, 'missing'));
  });
});
