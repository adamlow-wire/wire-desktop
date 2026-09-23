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

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';

const requireCjs = createRequire(path.resolve('package.json'));

describe('[TST-005] native updater subprocess display environment', function () {
  this.timeout(10000);
  it('preserves the Xvfb authority needed by nested Electron without copying secrets', () => {
    const {buildNativeFixtureEnvironment} = requireCjs('./electron/test/nativeFixtureEnvironment.ts');
    const source = {
      PATH: '/usr/bin',
      SystemRoot: 'C:\\Windows',
      DISPLAY: ':77',
      XAUTHORITY: '/tmp/fixture-Xauthority',
      PRIVATE_AUTH_TOKEN: 'must-not-propagate',
    };
    assert.deepEqual(buildNativeFixtureEnvironment(source, {UPDATER_FIXTURE_MODE: 'unsigned'}), {
      PATH: '/usr/bin',
      SystemRoot: 'C:\\Windows',
      DISPLAY: ':77',
      XAUTHORITY: '/tmp/fixture-Xauthority',
      UPDATER_FIXTURE_MODE: 'unsigned',
      ELECTRON_RUN_AS_NODE: '1',
    });
  });

  it('forces Node mode for nested Electron fixtures even if a caller supplies another value', () => {
    const {buildNativeFixtureEnvironment} = requireCjs('./electron/test/nativeFixtureEnvironment.ts');
    assert.deepEqual(
      buildNativeFixtureEnvironment({ELECTRON_RUN_AS_NODE: '0'}, {ELECTRON_RUN_AS_NODE: '0'}),
      {ELECTRON_RUN_AS_NODE: '1'},
    );
  });

  it('keeps the minimal environment when no display is configured', () => {
    const {buildNativeFixtureEnvironment} = requireCjs('./electron/test/nativeFixtureEnvironment.ts');
    assert.deepEqual(buildNativeFixtureEnvironment({PATH: '/usr/bin'}), {PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1'});
  });
});
