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

import {strict as assert} from 'node:assert';
import {createRequire} from 'node:module';
import path from 'node:path';

const requireCjs = createRequire(path.resolve('package.json'));
const source = path.resolve('electron/src/runtime/wallClockLoader.mts');

describe('[TST-006] instrumented wall-clock ESM source', () => {
  it('[security-target] returns the ESM factory result through the actual maintained adapter with coverage counters', () => {
    const transformed = transformFileSync(source, {
      babelrc: false,
      configFile: false,
      plugins: ['istanbul'],
      presets: ['@babel/preset-typescript', ['@babel/preset-env', {targets: {node: 'current'}}]],
    });
    assert.ok(transformed?.code);

    const NodeModule = requireCjs('node:module') as {
      _load: (request: string, parent: unknown, isMain: boolean) => unknown;
      _nodeModulePaths: (directory: string) => string[];
      new (id: string, parent: unknown): {
        filename: string;
        paths: string[];
        exports: {createDesktopWallClock: () => object};
        _compile: (code: string, filename: string) => void;
      };
    };
    const originalLoad = NodeModule._load;
    const expectedClock = {syntheticClock: true};
    NodeModule._load = function (request, parent, isMain) {
      if (request === '@enormora/wall-clock/wall-clock') {
        return {createWallClock: () => expectedClock};
      }
      return originalLoad.call(this, request, parent, isMain);
    };
    try {
      const loaded = new NodeModule(source, undefined);
      loaded.filename = source;
      loaded.paths = NodeModule._nodeModulePaths(path.dirname(source));
      loaded._compile(transformed.code, source);
      assert.equal(loaded.exports.createDesktopWallClock(), expectedClock);

      const counters = (globalThis as typeof globalThis & {__coverage__?: Record<string, {s: Record<string, number>}>})
        .__coverage__?.[source];
      assert.ok(counters, 'The actual .mts application module must emit source coverage counters.');
      assert.ok(Object.values(counters.s).length > 0);
      assert.ok(Object.values(counters.s).every(count => count > 0));
    } finally {
      NodeModule._load = originalLoad;
    }
  });
});
