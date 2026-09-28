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

import * as assert from 'assert';
import * as path from 'path';

import {
  LogDirectoryCleanupDependencies,
  LogDirectoryMetadata,
  removeEmptyLogDirectory,
  removeEmptyLogDirectoryAncestors,
} from './logDirectoryCleanup';

describe('log directory cleanup', () => {
  it('returns unexpected filesystem failures as an Err result', async () => {
    const expectedFailure = new Error('directory removal failed');
    const dependencies: LogDirectoryCleanupDependencies = {
      async getDirectoryMetadata(): Promise<LogDirectoryMetadata> {
        return {isDirectory: true, isSymbolicLink: false};
      },
      async removeDirectory(): Promise<void> {
        return Promise.reject(expectedFailure);
      },
    };

    const cleanupResult = await removeEmptyLogDirectory({dependencies, directoryPath: 'logs/2026-08-20'});

    assert.strictEqual(cleanupResult.isErr, true);

    if (cleanupResult.isErr) {
      assert.strictEqual(cleanupResult.error, expectedFailure);
    }
  });
});

describe('log directory cleanup refusal and recovery', () => {
  for (const metadata of [
    {isDirectory: true, isSymbolicLink: true},
    {isDirectory: false, isSymbolicLink: false},
  ]) {
    it(`never removes a ${metadata.isSymbolicLink ? 'symbolic link' : 'non-directory'}`, async () => {
      let removals = 0;
      const result = await removeEmptyLogDirectory({
        directoryPath: 'logs/candidate',
        dependencies: {
          async getDirectoryMetadata() {
            return metadata;
          },
          async removeDirectory() {
            removals += 1;
          },
        },
      });
      assert.strictEqual(result.isOk, true);
      assert.strictEqual(removals, 0);
    });
  }

  for (const stage of ['inspect', 'remove']) {
    for (const code of ['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EACCES']) {
      it(`handles ${code} during ${stage} without losing unexpected errors`, async () => {
        const failure = Object.assign(new Error('owned fixture failure'), {code});
        let removals = 0;
        const result = await removeEmptyLogDirectory({
          directoryPath: 'logs/candidate',
          dependencies: {
            async getDirectoryMetadata() {
              if (stage === 'inspect') {
                throw failure;
              }
              return {isDirectory: true, isSymbolicLink: false};
            },
            async removeDirectory() {
              removals += 1;
              throw failure;
            },
          },
        });
        assert.strictEqual(removals, stage === 'inspect' ? 0 : 1);
        assert.strictEqual(result.isErr, code === 'EACCES');
        if (result.isErr) {
          assert.strictEqual(result.error, failure);
        }
      });
    }
  }

  it('stops ancestor deletion on error and permits a later successful attempt without removing the root', async () => {
    const root = path.resolve('logs');
    const parent = path.join(root, 'date');
    const child = path.join(parent, 'account');
    const failure = new Error('owned removal failure');
    const inspected: string[] = [];
    const removed: string[] = [];
    let failRemoval = true;
    const parameters = {
      logDirectory: root,
      pathToRemove: path.join(child, 'console.log'),
      pathType: 'file' as const,
      dependencies: {
        async getDirectoryMetadata(directoryPath: string) {
          inspected.push(directoryPath);
          return {isDirectory: true, isSymbolicLink: false};
        },
        async removeDirectory(directoryPath: string) {
          removed.push(directoryPath);
          if (failRemoval) {
            throw failure;
          }
        },
      },
    };
    const failed = await removeEmptyLogDirectoryAncestors(parameters);
    assert.strictEqual(failed.isErr, true);
    if (failed.isErr) {
      assert.strictEqual(failed.error, failure);
    }
    assert.deepStrictEqual(inspected, [child]);
    assert.deepStrictEqual(removed, [child]);

    failRemoval = false;
    inspected.length = 0;
    removed.length = 0;
    const recovered = await removeEmptyLogDirectoryAncestors(parameters);
    assert.strictEqual(recovered.isOk, true);
    assert.deepStrictEqual(inspected, [child, parent]);
    assert.deepStrictEqual(removed, [child, parent]);
  });
});
