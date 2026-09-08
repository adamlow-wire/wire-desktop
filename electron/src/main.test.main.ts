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

import {transformFileSync} from '@babel/core';

import * as assert from 'assert';
import * as path from 'path';
import {runInNewContext} from 'vm';

describe('application startup sandbox', () => {
  it('[security-target][INV-001][SEC-006] enables sandboxing before configuration or main-process initialization', function () {
    this.timeout(10_000);
    const calls: string[] = [];
    const source = transformFileSync(path.resolve('electron/src/main.ts'), {
      envName: 'test',
      plugins: [['istanbul', {exclude: ['**/*.test*.ts']}]],
    })?.code;
    assert.ok(source);
    runInNewContext(source, {
      // Preserve real instrumentation counters while isolating startup side effects.
      __coverage__: Reflect.get(globalThis, '__coverage__'),
      exports: {},
      require: (name: string) => {
        if (name === 'electron') {
          return {app: {enableSandbox: () => calls.push('sandbox')}};
        }
        if (name === './runtime/configurePortableUserData') {
          return {configurePortableUserDataAtStartup: () => calls.push('configure')};
        }
        assert.strictEqual(name, './mainProcess');
        calls.push('main');
        return {};
      },
    });
    assert.deepStrictEqual(calls, ['sandbox', 'configure', 'main']);
  });
});
