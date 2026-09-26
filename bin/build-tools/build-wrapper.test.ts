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
import {spawnSync} from 'child_process';
import path from 'path';

function run(platform: string, phase: string) {
  const child = spawnSync(
    process.execPath,
    ['--require', path.resolve('.babel-register.js'), path.resolve('bin/build-tools/fixtures/build-wrapper.cjs')],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        WRAPPER_PLATFORM: platform,
        WRAPPER_PHASE: phase,
        WRAPPER_SOURCE_DIRECTORY: process.env.WRAPPER_SOURCE_DIRECTORY,
      },
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

describe('build wrapper native-tool failure propagation', function () {
  this.timeout(15000);
  for (const platform of ['windows', 'macos', 'linux', 'squirrel', 'msi']) {
    for (const phase of [
      'success',
      'package',
      'restore',
      ...(platform === 'squirrel' ? [] : ['read']),
      ...(['windows', 'macos'].includes(platform) ? ['fuses'] : []),
      ...(platform === 'macos' ? ['installer'] : []),
    ]) {
      it(`[PKG-001] ${platform} ${phase} preserves failure and metadata recovery`, () => {
        const result = run(platform, phase);
        assert.equal(result.rejected, phase !== 'success');
        assert.equal(result.exactFailure, phase !== 'success');
        assert.equal(result.secretLogged, false);
        if (phase === 'restore') {
          assert.equal(result.backupCount, 1);
          assert.equal(result.retainedOriginals, true);
        } else {
          assert.equal(result.packageRestored, true);
          assert.equal(result.wireRestored, true);
          assert.equal(result.backupCount, 0);
        }
        const expected = phase === 'read' ? [] : ['package'];
        if (['windows', 'macos'].includes(platform) && !['read', 'package'].includes(phase)) {
          expected.push('fuses');
        }
        if (platform === 'macos' && !['read', 'package', 'fuses'].includes(phase)) {
          expected.push('installer');
        }
        assert.deepEqual(result.events, expected);
      });
    }
  }
});
