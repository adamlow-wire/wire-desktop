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

import {buildNativeFixtureEnvironment} from '../../test/nativeFixtureEnvironment';

function startup(mode: string) {
  const result = spawnSync(process.execPath, [path.resolve('electron/test/fixtures/updater-startup.cjs'), mode], {
    encoding: 'utf8',
    timeout: 10000,
    env: buildNativeFixtureEnvironment(process.env),
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

describe('[PKG-002][F-007] production startup updater routing', () => {
  for (const mode of ['internal-mac', 'windows', 'app-store']) {
    it(`[characterization] ${mode} initializes protocols, menu and window once`, () => {
      const {calls, failed} = startup(mode);
      assert.equal(failed, false);
      assert.deepEqual(
        calls.filter((call: string) => call !== 'updater'),
        [
          'protocol:shell',
          'protocol:about',
          'protocol:proxy-prompt',
          'state',
          'menu',
          'set-menu',
          ...(mode === 'windows' ? ['tray'] : []),
          'window-start',
          'window-ready',
        ],
      );
    });
  }
  it('[characterization] passes the system regional locale through startup', () => {
    const {regionalLocale, calls} = startup('internal-mac');
    assert.equal(regionalLocale, 'en-GB');
    assert.equal(
      calls.some((call: string) => call.startsWith('warning:')),
      false,
    );
  });
  it('[regression-target] continues startup with a fixed diagnostic when regional locale lookup fails', () => {
    const {regionalLocale, calls} = startup('locale-failure');
    assert.equal(regionalLocale, undefined);
    assert.deepEqual(
      calls.filter((call: string) => call.startsWith('warning:')),
      ['warning:System regional locale is unavailable; omitting it from the webapp configuration.'],
    );
    assert.equal(calls.includes('window-ready'), true);
  });
  it('[regression-target] starts the internal mac updater after the window is ready', () => {
    const {calls, pendingReadyListeners} = startup('internal-mac');
    assert.equal(calls.filter((call: string) => call === 'updater').length, 1);
    assert.ok(calls.indexOf('updater') > calls.indexOf('window-ready'));
    assert.equal(pendingReadyListeners, 0);
  });
  for (const mode of ['windows', 'app-store', 'window-failure']) {
    it(`[characterization] ${mode} does not start the mac updater`, () => {
      const {calls, failed} = startup(mode);
      assert.equal(calls.includes('updater'), false);
      assert.equal(failed, mode === 'window-failure');
    });
  }
});
