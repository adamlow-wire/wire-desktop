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

import {generateAppRunScript} from 'app-builder-lib/out/targets/appimage/appImageUtil';
import {Arch} from 'builder-util';
import type {Configuration, Platform} from 'electron-builder';
import * as fs from 'fs-extra';

import * as assert from 'assert';
import {spawnSync} from 'child_process';
import * as os from 'os';
import * as path from 'path';

import {buildLinuxConfig, buildLinuxWrapper} from './build-linux';

import {generateUUID} from '../../bin-utils';

const wireJsonPath = path.join(__dirname, '../../../electron/wire.json');
const envFilePath = path.join(__dirname, '../../../.env.defaults');

describe('build-linux', () => {
  describe('AppImage sandbox launch policy', () => {
    it('does not request --no-sandbox from the desktop entry', async () => {
      const {builderConfig} = await buildLinuxConfig(wireJsonPath, envFilePath);

      assert.deepStrictEqual(builderConfig.appImage?.executableArgs, []);
    });

    it('does not add --no-sandbox when user namespaces are unavailable', () => {
      const appRun = generateAppRunScript({
        DesktopFileName: 'WireInternal-desktop',
        ExecutableName: 'WireInternal-desktop',
        ProductFilename: 'WireInternal',
        ProductName: 'WireInternal',
        ResourceName: 'wireinternal',
      });

      assert.ok(!appRun.includes('--no-sandbox'), 'AppRun must fail closed instead of disabling the Chromium sandbox.');
    });

    it('forwards application arguments without a sandbox bypass after a failed namespace probe', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appimage-sandbox-'));
      const appRunPath = path.join(tempDir, 'AppRun');
      const executablePath = path.join(tempDir, 'WireInternal-desktop');
      const argumentsPath = path.join(tempDir, 'arguments.txt');
      try {
        await fs.writeFile(
          appRunPath,
          generateAppRunScript({
            DesktopFileName: 'WireInternal-desktop',
            ExecutableName: 'WireInternal-desktop',
            ProductFilename: 'WireInternal',
            ProductName: 'WireInternal',
            ResourceName: 'wireinternal',
          }),
        );
        await fs.writeFile(executablePath, '#!/bin/sh\nprintf "%s\\n" "$@" > "$WIRE_APPIMAGE_ARGS"\n');
        await fs.chmod(executablePath, 0o755);
        await fs.writeFile(path.join(tempDir, 'unshare'), '#!/bin/sh\nexit 1\n');
        await fs.chmod(path.join(tempDir, 'unshare'), 0o755);

        const result = spawnSync('/bin/bash', [appRunPath, '--user-data-dir=fixture'], {
          encoding: 'utf8',
          env: {...process.env, APPDIR: tempDir, WIRE_APPIMAGE_ARGS: argumentsPath},
        });
        assert.strictEqual(result.status, 0, result.stderr);
        assert.strictEqual(await fs.readFile(argumentsPath, 'utf8'), '--user-data-dir=fixture\n');
      } finally {
        await fs.remove(tempDir);
      }
    });
  });

  describe('buildLinuxConfig', () => {
    it('[PKG-001][regression] keeps the installed desktop entry and Electron window identity aligned', async () => {
      const {builderConfig, linuxConfig} = await buildLinuxConfig(wireJsonPath, envFilePath);

      assert.strictEqual(builderConfig.extraMetadata?.desktopName, linuxConfig.executableName);
      assert.strictEqual(builderConfig.linux?.syncDesktopName, true);
      assert.strictEqual(builderConfig.appImage?.desktop?.entry?.StartupWMClass, linuxConfig.executableName);
      assert.strictEqual(builderConfig.deb?.desktop?.entry?.StartupWMClass, linuxConfig.executableName);
      assert.strictEqual(builderConfig.rpm?.desktop?.entry?.StartupWMClass, linuxConfig.executableName);
    });

    it('[PKG-001][regression] uses the supplied Wire Linux icons for installer and desktop integration', async () => {
      const {builderConfig} = await buildLinuxConfig(wireJsonPath, envFilePath);

      assert.strictEqual(builderConfig.linux?.icon, 'resources/icons');
    });

    it('does not rebuild the Windows-only registry module on Linux', async () => {
      const {builderConfig} = await buildLinuxConfig(wireJsonPath, envFilePath);

      assert.strictEqual(builderConfig.npmRebuild, false);
    });

    it('[PKG-001][compatibility] honors environment variables', async () => {
      const categories = generateUUID();
      const keywords = generateUUID();
      const nameShort = generateUUID();
      const targets = [generateUUID(), generateUUID()];

      process.env.LINUX_CATEGORIES = categories;
      process.env.LINUX_KEYWORDS = keywords;
      process.env.LINUX_NAME_SHORT = nameShort;
      process.env.LINUX_TARGET = targets.join(',');

      const {builderConfig, linuxConfig} = await buildLinuxConfig(wireJsonPath, envFilePath);

      assert.strictEqual(builderConfig.extraMetadata?.desktopName, nameShort);
      assert.strictEqual(builderConfig.linux?.executableName, nameShort);
      assert.strictEqual(builderConfig.appImage?.desktop?.entry?.StartupWMClass, nameShort);
      assert.strictEqual(linuxConfig.categories, categories);
      assert.strictEqual(linuxConfig.executableName, nameShort);
      assert.strictEqual(linuxConfig.keywords, keywords);
      assert.deepStrictEqual(linuxConfig.targets, targets);

      delete process.env.LINUX_CATEGORIES;
      delete process.env.LINUX_NAME_SHORT;
      delete process.env.LINUX_KEYWORDS;
      delete process.env.LINUX_TARGET;
    });
  });

  describe('buildLinuxWrapper', () => {
    it('propagates packaging errors and restores mutated configuration files', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'build-linux-'));
      const packageJsonPath = path.join(tempDir, 'package.json');
      const tempWireJsonPath = path.join(tempDir, 'wire.json');
      const tempEnvFilePath = path.join(tempDir, '.env.defaults');
      const originalPackageJson = {name: 'test-package', version: '1.0.0'};
      const originalWireJson = await fs.readJson(wireJsonPath);
      const controlledError = new Error('controlled packaging failure');

      await fs.writeJson(packageJsonPath, originalPackageJson);
      await fs.writeJson(tempWireJsonPath, originalWireJson);
      await fs.writeFile(tempEnvFilePath, '', 'utf8');

      try {
        await assert.rejects(
          buildLinuxWrapper(
            {} as Configuration,
            {
              artifactName: 'test.${ext}',
              categories: 'Network',
              executableName: 'test',
              genericName: 'Test',
              keywords: 'test',
              targets: ['AppImage'],
            },
            packageJsonPath,
            tempWireJsonPath,
            tempEnvFilePath,
            Arch.x64,
            async () => {
              throw controlledError;
            },
            () => new Map() as ReturnType<typeof Platform.LINUX.createTarget>,
          ),
          error => error === controlledError,
        );
        assert.deepStrictEqual(await fs.readJson(packageJsonPath), originalPackageJson);
        assert.deepStrictEqual(await fs.readJson(tempWireJsonPath), originalWireJson);
      } finally {
        await fs.remove(tempDir);
      }
    });
  });
});
