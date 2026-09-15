/*
 * Wire
 * Copyright (C) 2019 Wire Swiss GmbH
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

import {program as commander} from 'commander';
import * as electronBuilder from 'electron-builder';

import path from 'path';

import {LogFactory} from '@wireapp/commons';

import {buildLinuxConfig, buildLinuxWrapper} from './lib/build-linux';
import {buildMacOSConfig, buildMacOSWrapper} from './lib/build-macos';
import {buildWindowsConfig, buildWindowsWrapper} from './lib/build-windows';
import {buildWindowsInstaller, buildWindowsInstallerConfig} from './lib/build-windows-installer';
import {buildWindowsMsi, buildWindowsMsiConfig} from './lib/build-windows-msi';

const toolName = path.basename(__filename).replace('.ts', '');
const logger = LogFactory.getLogger(toolName, {forceEnable: true, namespace: '@wireapp/build-tools'});
const appSource = path.join(__dirname, '../../');

commander
  .name(toolName)
  .description(
    'Build the Wire wrapper for your platform.\n\nValid values for platform are: "windows", "windows-installer", "windows-msi", "macos", "linux".',
  )
  .option('-e, --env-file <path>', 'Specify the env file path', path.join(appSource, '.env.defaults'))
  .option(
    '-m, --manual-sign',
    `Manually sign and package the app (i.e. don't use electron-packager, macOS and Windows only)`,
  )
  .option('-a, --architecture <arch>', 'Specify build architecture (e.g. x64, arm64, ...)')
  .option('-p, --package-json <path>', 'Specify the package.json path', path.join(appSource, 'package.json'))
  .option('-w, --wire-json <path>', 'Specify the wire.json path', path.join(appSource, 'electron/wire.json'))
  .arguments('<platform>')
  .parse(process.argv);

const platform = (commander.args[0] || '').toLowerCase();

(async () => {
  const {architecture, envFile, manualSign, wireJson, packageJson} = commander.opts();

  switch (platform) {
    case 'win':
    case 'windows': {
      logger.info('Preparing Windows build.');
      const {windowsConfig, packagerConfig} = await buildWindowsConfig(wireJson, envFile, architecture);

      return buildWindowsWrapper(packagerConfig, packageJson, windowsConfig, wireJson, envFile);
    }

    case 'windows-installer': {
      logger.info('Preparing Windows installer build.');
      const {wInstallerOptions} = await buildWindowsInstallerConfig(wireJson, envFile, manualSign, architecture);

      return buildWindowsInstaller(wireJson, envFile, wInstallerOptions);
    }

    case 'windows-msi': {
      logger.info('Preparing Windows MSI build.');
      const {builderConfig} = await buildWindowsMsiConfig(wireJson, envFile, manualSign);
      const msiArchitecture = architecture ? electronBuilder.archFromString(architecture) : undefined;

      return buildWindowsMsi(builderConfig, packageJson, wireJson, envFile, msiArchitecture);
    }

    case 'mac':
    case 'macos': {
      logger.info('Preparing macOS build.');
      const {macOSConfig, packagerConfig} = await buildMacOSConfig(wireJson, envFile, manualSign, architecture);

      return buildMacOSWrapper(packagerConfig, macOSConfig, packageJson, wireJson, envFile, manualSign);
    }

    case 'linux': {
      logger.info('Preparing Linux build.');
      const {linuxConfig, builderConfig} = await buildLinuxConfig(wireJson, envFile);

      return buildLinuxWrapper(builderConfig, linuxConfig, packageJson, wireJson, envFile, architecture);
    }

    default: {
      logger.error('Invalid or no platform specified.');
      return commander.help({error: true});
    }
  }
})().catch(() => {
  logger.error('Build failed; see the preceding build stage.');
  process.exit(1);
});
