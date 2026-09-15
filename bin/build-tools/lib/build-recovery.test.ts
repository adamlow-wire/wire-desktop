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
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {restore, stub} from 'sinon';
import type {Options as PackagerOptions} from 'electron-packager';
import type {Options as InstallerOptions} from 'electron-winstaller';
import {Arch} from 'builder-util';

import {buildWindowsWrapper} from './build-windows';
import {buildMacOSWrapper} from './build-macos';
import {buildLinuxWrapper} from './build-linux';
import {buildWindowsInstaller} from './build-windows-installer';
import type {WindowsConfig, MacOSConfig, LinuxConfig} from './Config';

describe('build wrapper partial metadata write recovery', () => {
  for (const platform of ['windows', 'macos', 'linux', 'squirrel']) {
    for (const phase of platform === 'squirrel' ? ['wire'] : ['package', 'wire']) {
      it(`[security-target][PKG-001] restores original bytes after ${platform} ${phase} write fails`, async () => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wire-build-recovery-'));
        const actualMkdtemp = fs.mkdtemp.bind(fs);
        stub(fs, 'mkdtemp').callsFake((async () => actualMkdtemp(path.join(root, 'backup-'))) as typeof fs.mkdtemp);
        const packageFile = path.join(root, 'package.json');
        const wireFile = path.join(root, 'wire.json');
        const envFile = path.join(root, '.env.defaults');
        const packageBytes = ' {"name":"owned-fixture","version":"0.0.1"}\r\n';
        const wireBytes = await fs.readFile(path.resolve('electron/wire.json'), 'utf8');
        const controlled = new Error('controlled metadata write failure');
        let writes = 0;
        try {
          await fs.writeFile(packageFile, packageBytes);
          await fs.writeFile(wireFile, wireBytes);
          await fs.writeFile(envFile, '');
          stub(fs, 'writeJson').callsFake((async (destination: string, value: unknown) => {
            assert.ok(destination === packageFile || destination === wireFile, 'Only owned metadata may be changed.');
            writes++;
            await fs.writeFile(destination, JSON.stringify(value));
            if (destination === (phase === 'package' ? packageFile : wireFile)) {
              throw controlled;
            }
          }) as typeof fs.writeJson);
          const invoke = () => {
            switch (platform) {
              case 'windows':
                return buildWindowsWrapper({} as PackagerOptions, packageFile, {} as WindowsConfig, wireFile, envFile);
              case 'macos':
                return buildMacOSWrapper({} as PackagerOptions, {} as MacOSConfig, packageFile, wireFile, envFile);
              case 'squirrel':
                return buildWindowsInstaller(wireFile, envFile, {} as InstallerOptions);
              default:
                return buildLinuxWrapper(
                  {},
                  {targets: ['AppImage']} as LinuxConfig,
                  packageFile,
                  wireFile,
                  envFile,
                  Arch.x64,
                  async () => {
                    throw new Error('Packager must not run after metadata failure.');
                  },
                  () => new Map(),
                );
            }
          };
          await assert.rejects(invoke(), error => error === controlled);
          assert.equal(writes, platform === 'squirrel' || phase === 'package' ? 1 : 2);
          assert.equal(await fs.readFile(packageFile, 'utf8'), packageBytes);
          assert.equal(await fs.readFile(wireFile, 'utf8'), wireBytes);
        } finally {
          restore();
          await fs.remove(root);
        }
      });
    }
  }
});
