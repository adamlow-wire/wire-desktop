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

import {app} from 'electron';
import * as fs from 'fs-extra';

import * as assert from 'assert';
import * as path from 'path';

import {deleteAccount} from './LocalAccountDeletion';

import {getLogDirectory} from '../logging/logPaths';
import {config} from '../settings/config';

describe('local account deletion', () => {
  it('[characterization][DCP-004] deletes only the targeted partition and account log directories', async () => {
    const accountId = '11111111-1111-4111-8111-111111111111';
    const otherAccountId = '22222222-2222-4222-8222-222222222222';
    const partitionId = '33333333-3333-4333-8333-333333333333';
    const partitionDirectory = path.join(app.getPath('userData'), 'Partitions', partitionId);
    const logDirectory = getLogDirectory();
    const accountLogDirectory = path.join(logDirectory, '2099-01-01', 'accounts', accountId);
    const otherAccountLogDirectory = path.join(logDirectory, '2099-01-01', 'accounts', otherAccountId);

    await fs.outputFile(path.join(partitionDirectory, 'storage'), 'target');
    await fs.outputFile(path.join(accountLogDirectory, config.logFileName), 'target');
    await fs.outputFile(path.join(otherAccountLogDirectory, config.logFileName), 'other');

    try {
      await deleteAccount(-1, accountId, partitionId);

      assert.strictEqual(await fs.pathExists(partitionDirectory), false);
      assert.strictEqual(await fs.pathExists(accountLogDirectory), false);
      assert.strictEqual(await fs.pathExists(otherAccountLogDirectory), true);
    } finally {
      await fs.remove(partitionDirectory);
      await fs.remove(path.join(logDirectory, '2099-01-01'));
    }
  });

  it('[characterization][DCP-004] handles invalid account and partition identities without deleting data', async () => {
    const retainedDirectory = path.join(app.getPath('userData'), 'Partitions', 'retained-by-invalid-deletion');
    await fs.outputFile(path.join(retainedDirectory, 'storage'), 'retained');

    try {
      await deleteAccount(-1, 'invalid-account', 'invalid-partition');

      assert.strictEqual(await fs.pathExists(retainedDirectory), true);
    } finally {
      await fs.remove(retainedDirectory);
    }
  });
});
