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

describe('[PKG-001][F-015] Hockey asset stream lifetime', function () {
  this.timeout(15000);
  for (const mode of ['success', 'missing', 'dry']) {
    it(`${mode} keeps stream failures inside the upload promise and closes assets`, () => {
      const child = spawnSync(
        process.execPath,
        ['--require', path.resolve('.babel-register.js'), path.resolve('bin/deploy-tools/fixtures/hockey-stream.cjs')],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOCKEY_STREAM_MODE: mode},
        },
      );
      assert.equal(child.error, undefined);
      assert.equal(child.status, 0, child.stderr);
      const result = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
      assert.equal(result.uncaught, false);
      assert.equal(result.rejected, mode === 'missing');
      assert.equal(result.requests, mode === 'dry' ? 0 : 1);
      assert.equal(result.reads, mode === 'dry' ? 0 : 1);
      assert.equal(result.closed, true);
      assert.equal(result.message.includes('synthetic-private-path'), false);
    });
  }
});
