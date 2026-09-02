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

import * as fs from 'fs-extra';

import * as assert from 'assert';
import * as path from 'path';

import {
  fireAndForgetDesktopLogOperation,
  runDesktopLogCleanup,
  runDesktopLogMaintenance,
  writeBoundedLogMessage,
} from './desktopLogWriter';

import {withTemporaryDirectory} from '../../test/withTemporaryDirectory';

describe('desktop log writer facade', () => {
  it(
    'writes through the bounded filesystem implementation and reuses an existing file',
    withTemporaryDirectory('wire-desktop-log-writer-', async temporaryDirectory => {
      const logFilePath = path.join(temporaryDirectory, 'nested', 'electron.log');

      await writeBoundedLogMessage({logFilePath, message: 'first'});
      await writeBoundedLogMessage({logFilePath, message: 'second'});

      assert.strictEqual(await fs.readFile(logFilePath, 'utf8'), 'first\nsecond\n');
    }),
  );

  it('serializes explicit maintenance and coalesces concurrent cleanup requests', async () => {
    const events: string[] = [];
    const maintenanceResult = await runDesktopLogMaintenance(async () => {
      events.push('maintenance');

      return 'complete';
    });

    await Promise.all([runDesktopLogCleanup(), runDesktopLogCleanup()]);

    assert.strictEqual(maintenanceResult, 'complete');
    assert.deepStrictEqual(events, ['maintenance']);
  });

  it('starts a fire-and-forget operation through the shared failure boundary', async () => {
    let operationInvoked = false;
    await new Promise<void>((resolve, reject) => {
      fireAndForgetDesktopLogOperation(async () => {
        try {
          operationInvoked = true;
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    assert.strictEqual(operationInvoked, true);
  });
});
