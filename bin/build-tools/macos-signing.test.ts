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

function run(mode: string, phase: string) {
  const child = spawnSync(
    process.execPath,
    ['--require', path.resolve('.babel-register.js'), path.resolve('bin/build-tools/fixtures/macos-signing.cjs')],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SIGNING_MODE: mode, SIGNING_PHASE: phase},
    },
  );
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  return {result: JSON.parse(child.stdout.trim().split('\n').at(-1)!), stderr: child.stderr};
}

describe('[PKG-001][SEC-011] macOS signing order and fail-closed tools', function () {
  this.timeout(15000);
  it('[regression] relative build output preserves main executable entitlements', () => {
    const {result} = run('manual', 'relative');
    assert.equal(result.rejected, false);
    assert.equal(result.metadataRestored, true);
    assert.equal(result.mainEntitlements, 'resources/macos/entitlements/parent.plist');
  });
  for (const mode of ['automatic-missing-team', 'automatic-missing-sign', 'manual-missing-sign']) {
    it(`[security-target] ${mode} rejects incomplete signing configuration before packaging`, () => {
      const {result, stderr} = run(mode, 'success');
      assert.equal(result.rejected, true);
      assert.deepEqual(result.events, []);
      assert.equal(result.metadataRestored, true);
      assert.equal(result.secretLogged || stderr.includes('synthetic-signing-failure-secret'), false);
    });
  }
  for (const [mode, phases] of [
    ['unsigned', ['success', 'package', 'fuses']],
    ['automatic', ['success', 'package', 'fuses', 'sign', 'notarize', 'installer']],
    ['manual', ['success', 'sign', 'installer']],
  ] as const) {
    for (const phase of phases) {
      it(`${
        mode === 'unsigned' || phase === 'package' ? '[characterization]' : '[security-target]'
      } ${mode} ${phase} preserves order, failure and metadata`, () => {
        const {result, stderr} = run(mode, phase);
        const sequence =
          mode === 'unsigned'
            ? ['package', 'fuses']
            : mode === 'manual'
            ? ['package', 'fuses', 'sign', 'installer']
            : ['package', 'fuses', 'sign', 'notarize', 'installer'];
        const expected = phase === 'success' ? sequence : sequence.slice(0, sequence.indexOf(phase) + 1);
        assert.equal(result.rejected, phase !== 'success');
        assert.equal(result.exactFailure, phase !== 'success');
        assert.equal(result.metadataRestored, true);
        assert.equal(result.secretLogged || stderr.includes('synthetic-signing-failure-secret'), false);
        assert.deepEqual(result.events, expected);
        if (phase === 'success' && mode !== 'unsigned') {
          assert.deepEqual(result.signingOptions, [
            {
              app: result.appFile,
              identity: "Fixture ' application identity",
              platform: 'mas',
              parent: 'resources/macos/entitlements/parent.plist',
              child:
                mode === 'manual'
                  ? 'resources/macos/entitlements/child.plist'
                  : 'resources/macos/entitlements/parent.plist',
            },
          ]);
          assert.deepEqual(result.installerOptions, [
            {
              app: result.appFile,
              identity: "Fixture ' installer identity",
              platform: 'mas',
            },
          ]);
          assert.deepEqual(
            result.notaryOptions,
            mode === 'manual'
              ? []
              : [
                  {
                    appPath: result.appFile,
                    teamId: 'FIXTURETEAM',
                    tool: 'notarytool',
                  },
                ],
          );
        }
      });
    }
  }
});
