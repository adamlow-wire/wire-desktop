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

describe('[PKG-001][F-015] deployment failure diagnostics', function () {
  this.timeout(15000);
  let results: {
    mode: string;
    rejected: boolean;
    message: string;
    value?: {id: number};
    calls: {method: string; url: string; authorized: boolean}[];
    leaked: boolean;
  }[];
  before(() => {
    const child = spawnSync(
      process.execPath,
      [
        '--require',
        path.resolve('.babel-register.js'),
        path.resolve('bin/deploy-tools/fixtures/deployment-errors.cjs'),
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot},
      },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    results = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
  });
  for (const operation of ['github-create', 'github-upload', 'github-delete', 'hockey-create', 'hockey-upload']) {
    for (const outcome of ['success', 'response', 'offline']) {
      it(`${operation} ${outcome} preserves result and excludes sensitive diagnostics`, () => {
        const result = results.find(item => item.mode === `${operation}-${outcome}`)!;
        assert.ok(result);
        assert.equal(result.rejected, outcome !== 'success');
        assert.ok(result.calls.length > 0);
        assert.ok(result.calls.every(call => call.authorized));
        if (outcome === 'success') {
          assert.equal(result.calls.length, 1);
          if (operation.endsWith('create')) {
            assert.deepEqual(result.value, {id: 42});
          }
        } else {
          assert.match(result.message, /failed/i);
          if (operation.startsWith('github') && operation !== 'github-create') {
            assert.deepEqual(
              result.calls.map(call => call.method),
              ['post', 'delete'],
            );
            assert.equal(result.calls[1].url, 'https://api.github.com/repos/fixture/owned/releases/42');
          }
        }
        assert.equal(result.leaked, false);
      });
    }
  }
});
