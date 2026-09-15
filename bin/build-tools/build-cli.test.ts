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
 */

import {strict as assert} from 'assert';
import {spawnSync} from 'child_process';
import * as path from 'path';

type CliRecord = {kind: string; route?: string; receivedExactConfig?: boolean; level?: string; args?: string[]};
// test:bin runs from the repository root; child commands use the same directory.
const root = process.cwd();

function run(platform?: string, mode: string = 'success') {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      path.join(root, '.babel-register.js'),
      '--require',
      path.join(root, 'bin/build-tools/fixtures/build-cli.cjs'),
      path.join(root, 'bin/build-tools/build-cli.ts'),
      ...(platform ? [platform] : []),
      '--architecture',
      'ia32',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 10000,
      env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, BUILD_CLI_FIXTURE_MODE: mode},
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  const records: CliRecord[] = result.stdout
    .split('\n')
    .filter(line => line.startsWith('{'))
    .map(line => JSON.parse(line));
  return {...result, records};
}

describe('build CLI diagnostics and failure status', function () {
  this.timeout(15000);
  for (const [platform, route] of [
    ['win', 'windows'],
    ['windows', 'windows'],
    ['windows-installer', 'windows-installer'],
    ['windows-msi', 'windows-msi'],
    ['mac', 'macos'],
    ['macos', 'macos'],
    ['linux', 'linux'],
  ]) {
    describe(platform, () => {
      let result: ReturnType<typeof run>;
      before(() => {
        result = run(platform);
      });
      it('[characterization][PKG-001] routes the selected platform and preserves its configuration', () => {
        assert.equal(result.status, 0);
        assert.deepEqual(
          result.records.filter(record => record.kind === 'build'),
          [{kind: 'build', route, receivedExactConfig: true}],
        );
      });
      it('[security-target][PKG-001][INV-010] emits useful diagnostics without dumping configuration secrets', () => {
        assert.ok(
          result.records.some(record => record.kind === 'diagnostic'),
          'Retain useful stage diagnostics.',
        );
        assert.equal(`${result.stdout}${result.stderr}`.includes('fixture-build-secret-only'), false);
      });
    });
  }
  for (const mode of ['config-failure', 'build-failure']) {
    it(`[security-target][PKG-001][INV-010] fails closed without leaking ${mode} errors`, () => {
      const result = run('macos', mode);
      assert.equal(result.status, 1);
      assert.ok(result.records.some(record => record.kind === 'diagnostic' && record.level === 'error'));
      assert.equal(`${result.stdout}${result.stderr}`.includes('fixture-build-secret-only'), false);
      assert.equal(result.records.filter(record => record.kind === 'build').length, mode === 'build-failure' ? 1 : 0);
    });
  }
  it('[security-target][PKG-001] rejects unsupported platforms without starting a build', () => {
    const result = run('unsupported-platform');
    assert.ok(
      result.records.some(
        record => record.level === 'error' && record.args?.includes('Invalid or no platform specified.'),
      ),
    );
    assert.equal(result.status, 1);
    assert.equal(result.records.filter(record => record.kind === 'build').length, 0);
  });
  it('[characterization][PKG-001] rejects a missing required platform without starting a build', () => {
    const result = run();
    assert.ok(result.stderr.includes("missing required argument 'platform'"));
    assert.equal(result.status, 1);
    assert.equal(result.records.filter(record => record.kind === 'build').length, 0);
  });
});
