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

describe('[PKG-001][F-015] deployment CLI failure boundary', function () {
  this.timeout(15000);
  for (const cli of ['github-draft', 'hockey', 's3', 's3-win-releases']) {
    for (const mode of ['success', 'preparation', 'operation']) {
      it(`${cli} ${mode} preserves exit status without exposing arbitrary errors`, () => {
        const args =
          cli === 'github-draft'
            ? ['--github-token', 'synthetic-cli-secret']
            : cli === 'hockey'
            ? ['--hockey-token', 'synthetic-cli-secret', '--hockey-id', 'fixture']
            : ['--bucket', 'fixture', '--key-id', 'fixture', '--secret-key', 'synthetic-cli-secret'];
        const child = spawnSync(
          process.execPath,
          [
            '--require',
            path.resolve('.babel-register.js'),
            '--require',
            path.resolve('bin/deploy-tools/fixtures/deployment-cli.cjs'),
            path.resolve(`bin/deploy-tools/${cli}-cli.ts`),
            '--wrapper-build',
            'Windows#1.2.3',
            '--dry-run',
            ...args,
          ],
          {
            encoding: 'utf8',
            timeout: 10000,
            env: {PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, DEPLOY_CLI_MODE: mode},
          },
        );
        assert.equal(child.error, undefined);
        assert.equal(child.signal, null);
        assert.equal(child.status, mode === 'success' ? 0 : 1, child.stderr);
        const records = child.stdout
          .split('\n')
          .filter(line => line.startsWith('{'))
          .map(line => JSON.parse(line));
        assert.ok(
          records.some(
            record => record.kind === 'step' && record.stage === (mode === 'preparation' ? 'preparation' : 'operation'),
          ),
        );
        if (mode !== 'preparation') {
          assert.ok(records.some(record => record.kind === 'config' && record.dryRun === true));
        }
        if (mode !== 'success') {
          assert.ok(records.some(record => record.kind === 'diagnostic' && record.level === 'error'));
        }
        assert.equal(`${child.stdout}${child.stderr}`.includes('synthetic-cli-secret'), false);
      });
    }
  }
});
