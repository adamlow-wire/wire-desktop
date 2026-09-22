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

describe('[PKG-001][F-015] deployment dry-run confidentiality', function () {
  this.timeout(15000);
  let result: {draft: {id: number}; requests: number; diagnostics: string};
  before(() => {
    const child = spawnSync(
      process.execPath,
      [
        '--require',
        path.resolve('.babel-register.js'),
        path.resolve('bin/deploy-tools/fixtures/dry-run-confidentiality.cjs'),
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot},
      },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    result = JSON.parse(child.stdout.trim().split('\n').at(-1)!);
  });
  it('[characterization] returns the dry draft without network requests and identifies operations', () => {
    assert.deepEqual(result.draft, {id: 0});
    assert.equal(result.requests, 0);
    for (const operation of ['createDraft', 'uploadAsset', 'uploadVersion']) {
      assert.ok(result.diagnostics.includes(operation));
    }
  });
  it('[security-target] excludes credentials and arbitrary payloads from diagnostics', () => {
    for (const secret of [
      'synthetic-review-token',
      'synthetic-private-changelog',
      'synthetic-other-token',
      'synthetic-private-payload',
    ]) {
      assert.equal(result.diagnostics.includes(secret), false, secret);
    }
    assert.equal(result.diagnostics.includes('Buffer'), false);
  });
});
