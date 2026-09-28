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

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const os = require('node:os');
const fs = require('fs-extra');
assert.equal(process.versions.electron, undefined);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-wrapper-fixture-'));
const repo = process.cwd();
const platform = process.env.WRAPPER_PLATFORM;
const phase = process.env.WRAPPER_PHASE;
const secret = 'fixture-packaging-error-secret';
const failure = new Error(secret);
const events = [];
const diagnostics = [];
const commonConfig = {name: 'OwnedFixture', version: '1.0.0', buildDir: root, distDir: root};
const packageFile = path.join(root, 'package.json');
const wireFile = path.join(root, 'wire.json');
const originalPackage = ' {"version":"original"}\r\n';
const originalWire = ' {"name":"original"}\n';
fs.writeFileSync(packageFile, originalPackage);
fs.writeFileSync(wireFile, originalWire);
os.tmpdir = () => root; // All backup directories remain owned and removable by this fixture.
const step = async name => {
  events.push(name);
  if (phase === name) throw failure;
};
const packager = async () => {
  await step('package');
  return [root];
};
const builder = {
  Arch: {x64: 1, 1: 'x64'},
  Platform: {WINDOWS: {createTarget: () => new Map()}, LINUX: {createTarget: () => new Map()}},
  build: async () => {
    await step('package');
    return ['owned-artifact'];
  },
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron-packager') return packager;
  if (request === 'electron-builder') return builder;
  if (request === 'electron-winstaller') return {createWindowsInstaller: async () => step('package')};
  if (request === '@electron/osx-sign') return {flatAsync: async () => step('installer')};
  if (request === './commonConfig')
    return {
      getCommonConfig: async () => ({commonConfig: {...commonConfig}}),
      flipElectronFuses: async () => step('fuses'),
    };
  if (request === '../../bin-utils') return load.call(this, path.join(repo, 'bin/bin-utils.ts'), parent, isMain);
  if (request === '@wireapp/commons')
    return {
      LogFactory: {
        getLogger: () =>
          Object.fromEntries(
            ['info', 'warn', 'error', 'log'].map(level => [
              level,
              (...args) => diagnostics.push(args.map(String).join(' ')),
            ]),
          ),
      },
    };
  return load.call(this, request, parent, isMain);
};
const actualReadJson = fs.readJson.bind(fs);
fs.readJson = async (...args) => {
  if (phase === 'read' && args[0] === packageFile) throw failure;
  return actualReadJson(...args);
};
const actualCopy = fs.copy.bind(fs);
fs.copy = async (source, destination, options) => {
  if (source.includes('wire-build-') && phase === 'restore') throw failure;
  return actualCopy(source, destination, options);
};
(async () => {
  try {
    await fs.outputFile(path.join(root, 'OwnedFixture-win32-x64', 'OwnedFixture.exe'), 'inert fixture');
    const directory = process.env.WRAPPER_SOURCE_DIRECTORY || path.join(repo, 'bin/build-tools/lib');
    let error;
    try {
      switch (platform) {
        case 'windows':
          await require(path.join(directory, 'build-windows.ts')).buildWindowsWrapper(
            {name: 'OwnedFixture'},
            packageFile,
            {},
            wireFile,
            'unused',
          );
          break;
        case 'macos':
          await require(path.join(directory, 'build-macos.ts')).buildMacOSWrapper(
            {},
            {certNameInstaller: 'fixture'},
            packageFile,
            wireFile,
            'unused',
          );
          break;
        case 'linux':
          await require(path.join(directory, 'build-linux.ts')).buildLinuxWrapper(
            {},
            {targets: ['AppImage']},
            packageFile,
            wireFile,
            'unused',
            1,
            builder.build,
            () => new Map(),
          );
          break;
        case 'squirrel':
          await require(path.join(directory, 'build-windows-installer.ts')).buildWindowsInstaller(wireFile, 'unused', {
            outputDirectory: root,
          });
          break;
        case 'msi':
          await require(path.join(directory, 'build-windows-msi.ts')).buildWindowsMsi(
            {},
            packageFile,
            wireFile,
            'unused',
            1,
          );
          break;
        default:
          throw new Error('Unknown fixture platform');
      }
    } catch (caught) {
      error = caught;
    }
    const backups = (await fs.readdir(root)).filter(name => name.startsWith('wire-build-'));
    const retainedBackupContents = [];
    for (const directory of backups) {
      for (const name of await fs.readdir(path.join(root, directory))) {
        retainedBackupContents.push(await fs.readFile(path.join(root, directory, name), 'utf8'));
      }
    }
    process.stdout.write(
      JSON.stringify({
        events,
        rejected: Boolean(error),
        exactFailure: error === failure,
        secretLogged: diagnostics.some(value => value.includes(secret)),
        packageRestored: (await fs.readFile(packageFile, 'utf8')) === originalPackage,
        wireRestored: (await fs.readFile(wireFile, 'utf8')) === originalWire,
        backupCount: backups.length,
        retainedOriginals:
          retainedBackupContents.includes(originalWire) &&
          (platform === 'squirrel' || retainedBackupContents.includes(originalPackage)),
      }) + '\n',
    );
  } finally {
    await fs.remove(root);
  }
})().catch(() => {
  process.stderr.write('Wrapper fixture infrastructure failed.\n');
  process.exitCode = 1;
});
