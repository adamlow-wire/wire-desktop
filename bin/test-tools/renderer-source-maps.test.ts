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

import type {Configuration} from 'webpack';

import * as assert from 'assert';
import {createRequire} from 'module';
import * as path from 'path';

const loadConfig = createRequire(path.resolve('package.json'));
const createConfig: (env: {production?: boolean}) => Configuration[] = loadConfig('./webpack.config.cjs');

describe('[SEC-010] renderer bundle source maps', () => {
  it('excludes generated renderer bundles from source type checking', () => {
    const compilerConfig: {exclude: string[]} = loadConfig('./tsconfig.json');
    assert.ok(compilerConfig.exclude.includes('electron/renderer/dist'));
  });

  for (const production of [true, false]) {
    it(`does not require eval in ${production ? 'production' : 'development'}`, () => {
      const renderer = createConfig({production}).find(config => config.target === 'electron-renderer');
      assert.ok(renderer);
      assert.doesNotMatch(String(renderer.devtool), /eval/i);
      assert.strictEqual(renderer.mode, production ? 'production' : 'development');
    });
  }
});
