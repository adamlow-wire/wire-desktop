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

function run(mode: string) {
  const child = spawnSync(
    process.execPath,
    ['--require', path.resolve('.babel-register.js'), path.resolve('electron/test/fixtures/macos-updater.cjs')],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, UPDATER_FIXTURE_MODE: mode},
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout.trim().split('\n').at(-1)!);
}

describe('[PKG-002][F-007] macOS updater diagnostics and async failures', function () {
  this.timeout(15000);
  for (const mode of ['development', 'app-store', 'unsigned', 'missing-policy', 'invalid-policy', 'unpackaged']) {
    it(`${
      ['development', 'app-store'].includes(mode) ? '[characterization]' : '[security-target]'
    } ${mode} starts no checks or dialogs`, () => {
      const result = run(mode);
      assert.equal(result.checks, 0);
      assert.equal(result.feeds, 0);
      assert.equal(result.dialogs, 0);
      assert.equal(result.installs, 0);
      assert.equal(result.threw || result.unhandled, false);
    });
  }
  for (const mode of ['later', 'install']) {
    it(`[characterization] ${mode} preserves feed delivery and native user choice`, () => {
      const result = run(mode);
      assert.equal(result.checks, 1);
      assert.equal(result.exactFeed, true);
      assert.equal(result.dialogs, 1);
      assert.equal(result.installs, mode === 'install' ? 1 : 0);
      assert.equal(result.threw || result.unhandled, false);
    });
  }
  for (const mode of [
    'later',
    'event-error',
    'setup-throw',
    'check-throw',
    'check-reject',
    'dialog-reject',
    'install-throw',
  ]) {
    it(`[security-target] ${mode} contains failures without logging credentials`, () => {
      const result = run(mode);
      assert.equal(result.threw, false);
      assert.equal(result.unhandled, false);
      assert.equal(result.leaked, false);
      if (mode === 'dialog-reject') {
        assert.equal(result.installs, 0);
      }
    });
  }
});
