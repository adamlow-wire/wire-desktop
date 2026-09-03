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

import {updateDownloadLocation} from './updateDownloadLocation';

const createDependencies = (isWindows: boolean) => {
  const calls: string[] = [];
  return {
    calls,
    dependencies: {
      ensureDirectory: (path: string) => calls.push(`ensure:${path}`),
      isWindows,
      persist: () => calls.push('persist'),
      resolvePath: (downloadPath: string) => `C:\\Users\\wire\\${downloadPath}`,
      save: (downloadPath: string | undefined) => calls.push(`save:${String(downloadPath)}`),
    },
  };
};

describe('download location update', () => {
  it('[characterization][CAP-005] creates and persists a configured Windows download directory', () => {
    const {calls, dependencies} = createDependencies(true);

    updateDownloadLocation('downloads', dependencies);

    assert.deepStrictEqual(calls, [
      'ensure:C:\\Users\\wire\\downloads',
      'save:downloads',
      'persist',
    ]);
  });

  it('[characterization][CAP-005] clears the Windows setting without creating a directory', () => {
    const {calls, dependencies} = createDependencies(true);

    updateDownloadLocation(undefined, dependencies);

    assert.deepStrictEqual(calls, ['save:undefined', 'persist']);
  });

  it('[characterization][CAP-005] ignores download-location updates on other platforms', () => {
    const {calls, dependencies} = createDependencies(false);

    updateDownloadLocation('downloads', dependencies);

    assert.deepStrictEqual(calls, []);
  });
});
