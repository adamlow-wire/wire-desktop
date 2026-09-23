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
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const collector = path.resolve('bin/test-tools/check-diff-coverage.js');

function git(root: string, ...arguments_: string[]): string {
  const result = spawnSync('git', arguments_, {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function runChangedSource(extension: string): {status: number | null; output: string} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-diff-coverage-contract-'));
  try {
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Wire fixture');
    git(root, 'config', 'user.email', 'fixture@example.invalid');
    const source = path.join(root, 'electron/src/runtime', `runtimeAdapter.${extension}`);
    fs.mkdirSync(path.dirname(source), {recursive: true});
    fs.writeFileSync(source, 'export const answer = 1;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'initial source');
    const base = git(root, 'rev-parse', 'HEAD');
    fs.writeFileSync(source, 'export const answer = 2;\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'change maintained runtime source');
    for (const directory of ['electron', 'renderer']) {
      const report = path.join(root, 'coverage', directory, 'coverage-final.json');
      fs.mkdirSync(path.dirname(report), {recursive: true});
      fs.writeFileSync(report, '{}');
    }
    const result = spawnSync(process.execPath, [collector], {
      cwd: root,
      encoding: 'utf8',
      env: {...process.env, DIFF_COVERAGE_BASE: base},
    });
    return {status: result.status, output: result.stdout + result.stderr};
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

describe('changed-code coverage source ownership', () => {
  it('fails if changed maintained TypeScript has no coverage counters', () => {
    const result = runChangedSource('ts');
    assert.notEqual(result.status, 0);
    assert.match(result.output, /absent from coverage/);
  });

  it('does not report a green 0/0 when changed maintained ESM TypeScript is uninstrumented', () => {
    const result = runChangedSource('mts');
    assert.notEqual(result.status, 0);
    assert.match(result.output, /absent from coverage|Uninstrumented application source/);
  });
});
