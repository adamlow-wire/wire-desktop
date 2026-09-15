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

import fs from 'fs-extra';

import {strict as assert} from 'assert';
import {createRequire} from 'module';
import os from 'os';
import path from 'path';

import {buildLinuxConfig} from './build-linux';
import {buildMacOSConfig} from './build-macos';
import {buildWindowsConfig} from './build-windows';

const requireTool = createRequire(path.resolve('package.json'));
const {populateIgnoredPaths, userPathFilter} = requireTool('electron-packager/src/copy-filter');
const {getMainFileMatchers} = requireTool('app-builder-lib/out/fileMatcher');
const appFiles = [
  'wire.json',
  'dist/main.js',
  'dist/preload/account.js',
  'dist/runtime/wallClockLoader.mjs',
  'dist/locale/en-US.json',
  'dist/preload.js.LICENSE.txt',
  'renderer/index.html',
  'renderer/dist/bundle.js',
  'renderer/dist/bundle.js.LICENSE.txt',
  'html/about.html',
  'html/proxy-prompt.html',
  'html/display-capture.html',
  'css/about.css',
  'css/wrapper.css',
  'img/logo.ico',
  'img/tray-icon/icon.png',
];
const unrelated = [
  '.env',
  '.env.defaults',
  'e2e-tests/.env',
  'keys/example-private.pem',
  'test-results/example/trace.zip',
  'AGENTS.md',
];
const privateAppFiles = [
  'src/main.ts',
  'test/fixtures/auth.json',
  'dist/main.d.ts',
  'dist/main.js.map',
  'dist/secret.json',
  'dist/secret.pem',
  'dist/runtime/fixture.test.main.js',
  'dist/tests/helper.js',
  'renderer/dist/test.js',
  'renderer/src/App.tsx',
  'img/private.pem',
  'html/unrelated.html',
];

for (const platform of ['windows', 'macos', 'linux']) {
  for (const electronDirectory of ['electron', 'nested/custom-app']) {
    describe(`[PKG-001] ${platform} packaged inputs at ${electronDirectory}`, () => {
      let root: string;
      let filter: (file: string) => boolean | Promise<boolean>;
      const required = ['package.json', 'LICENSE', ...appFiles.map(file => `${electronDirectory}/${file}`)];
      const denied = [...unrelated, ...privateAppFiles.map(file => `${electronDirectory}/${file}`)];
      before(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-package-inputs-'));
        for (const file of [...required, ...denied]) {
          await fs.outputFile(path.join(root, file), 'synthetic fixture');
        }
        const configFile = path.join(root, 'fixture-wire.json');
        await fs.writeJson(configFile, {...(await fs.readJson(path.resolve('electron/wire.json'))), electronDirectory});
        const envFile = path.join(root, 'fixture.env');
        await fs.writeFile(envFile, '');
        if (platform === 'linux') {
          const {builderConfig} = await buildLinuxConfig(configFile, envFile);
          const destination = path.join(root, 'output');
          const matchers = getMainFileMatchers(
            root,
            destination,
            (value: string) => value,
            {},
            {
              info: {
                projectDir: root,
                buildResourcesDir: 'resources',
                config: builderConfig,
                isPrepackedAppAsar: false,
                debugLogger: {isEnabled: false},
              },
            },
            destination,
            false,
          );
          assert.equal(matchers.length, 1);
          const nativeFilter = matchers[0].createFilter();
          filter = file => nativeFilter(file, fs.statSync(file));
        } else {
          const {packagerConfig} =
            platform === 'windows'
              ? await buildWindowsConfig(configFile, envFile)
              : await buildMacOSConfig(configFile, envFile, true);
          const options = {...packagerConfig, dir: root, out: path.join(root, 'output'), prune: false};
          populateIgnoredPaths(options);
          filter = userPathFilter(options);
        }
      });
      after(async () => {
        if (root) {
          await fs.remove(root);
        }
      });
      async function copied(file: string) {
        let parent = path.posix.dirname(file);
        while (parent !== '.') {
          if (!(await filter(path.join(root, parent)))) {
            return false;
          }
          parent = path.posix.dirname(parent);
        }
        return filter(path.join(root, file));
      }
      it('[characterization] retains required application runtime assets', async () => {
        for (const file of required) {
          assert.equal(await copied(file), true, file);
        }
      });
      for (const file of denied) {
        it(`[security-target][INV-010] excludes ${file}`, async () => {
          assert.equal(await copied(file), false);
        });
      }
    });
  }
}
