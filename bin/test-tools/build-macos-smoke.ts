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

import {FuseV1Options, getCurrentFuseWire} from '@electron/fuses';

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {stat} from 'node:fs/promises';
import path from 'node:path';

import {buildMacOSConfig, buildMacOSWrapper} from '../build-tools/lib/build-macos';

async function main(): Promise<void> {
  assert.ok(
    process.platform === 'darwin' && process.env.GITHUB_ACTIONS === 'true',
    'Use a disposable macOS CI runner.',
  );
  const architecture = process.arch;
  assert.ok(architecture === 'x64' || architecture === 'arm64', 'Use a supported native macOS architecture.');
  console.info(`Qualifying the Darwin package on native ${architecture}.`);
  const wireJson = path.resolve('electron/wire.json');
  const envFile = path.resolve('.env.defaults');
  const packageJson = path.resolve('package.json');
  const {packagerConfig, macOSConfig} = await buildMacOSConfig(wireJson, envFile, true, architecture);
  // Functional M3 qualification uses the standard runtime; signed MAS qualification remains M4/M5.
  packagerConfig.platform = 'darwin';
  delete packagerConfig.osxSign;
  delete packagerConfig.osxNotarize;
  macOSConfig.certNameApplication = null;
  macOSConfig.certNameInstaller = null;
  await buildMacOSWrapper(packagerConfig, macOSConfig, packageJson, wireJson, envFile, true);
  assert.equal(typeof packagerConfig.out, 'string');
  assert.equal(typeof packagerConfig.name, 'string');
  const app = path.resolve(
    packagerConfig.out!,
    `${packagerConfig.name}-darwin-${architecture}`,
    `${packagerConfig.name}.app`,
  );
  assert.ok((await stat(app)).isDirectory(), 'The development app must actually exist.');
  const executable = path.join(app, 'Contents', 'MacOS', packagerConfig.name!);
  const actualArchitecture = execFileSync('/usr/bin/lipo', ['-archs', executable], {encoding: 'utf8'}).trim();
  assert.equal(actualArchitecture, architecture === 'x64' ? 'x86_64' : 'arm64', 'Qualify the runner-native binary.');
  const fuses = await getCurrentFuseWire(app);
  for (const [option, state] of [
    [FuseV1Options.RunAsNode, '0'],
    [FuseV1Options.EnableCookieEncryption, '1'],
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable, '0'],
    [FuseV1Options.EnableNodeCliInspectArguments, '0'],
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, '0'],
    [FuseV1Options.OnlyLoadAppFromAsar, '1'],
  ] as const) {
    assert.equal(fuses[option], state.charCodeAt(0), `Preserve configured fuse ${FuseV1Options[option]}.`);
  }
  // Repair the development bundle's code seal after fuse writes. No signing identity or trust-store change.
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', app], {stdio: 'inherit'});
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], {stdio: 'inherit'});
  assert.deepEqual(await getCurrentFuseWire(app), fuses, 'Ad-hoc sealing must preserve every fuse.');
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
