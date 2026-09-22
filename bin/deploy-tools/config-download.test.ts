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

describe('[PKG-001] configuration download failure propagation', function () {
  this.timeout(15000);
  for (const mode of ['success', 'request', 'stream', 'invalid', 'collision']) {
    it(`${mode} settles without unhandled failures or losing existing files`, () => {
      const child = spawnSync(process.execPath, [path.resolve('bin/deploy-tools/fixtures/config-download.cjs')], {
        encoding: 'utf8',
        timeout: 10000,
        env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, CONFIG_DOWNLOAD_MODE: mode},
      });
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
      assert.equal(result.settled, true);
      assert.equal(result.unhandled, false);
      assert.equal(result.rejected, mode !== 'success');
      assert.equal(result.archiveExists, mode === 'collision');
      assert.equal(result.existingPreserved, true);
      assert.equal(result.extracted, mode === 'success');
      assert.equal(result.message.includes('synthetic-config-secret'), false);
    });
  }
});
