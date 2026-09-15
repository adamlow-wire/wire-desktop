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
assert.equal(process.versions.electron, undefined, 'Build CLI fixture must be Node-only.');
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const secret = 'fixture-build-secret-only';
const mode = process.env.BUILD_CLI_FIXTURE_MODE;
const logger = Object.fromEntries(
  ['info', 'warn', 'error', 'log'].map(level => [
    level,
    (...args) => emit({kind: 'diagnostic', level, args: args.map(String)}),
  ]),
);
const settings = {
  notarizeApplePassword: secret,
  osxNotarize: {appleIdPassword: secret},
  unknownFutureCredential: secret,
};
const configured = {};
for (const name of [
  'windowsConfig',
  'packagerConfig',
  'wInstallerOptions',
  'builderConfig',
  'windowsMsiConfig',
  'macOSConfig',
  'linuxConfig',
])
  configured[name] = {...settings};
const configuration = async () => {
  if (mode === 'config-failure') throw new Error(secret);
  return configured;
};
const build =
  route =>
  async (...args) => {
    emit({kind: 'build', route, receivedExactConfig: args.some(arg => Object.values(configured).includes(arg))});
    if (mode === 'build-failure') throw new Error(secret);
  };
const replacements = {
  'electron-builder': {archFromString: arch => arch},
  '@wireapp/commons': {LogFactory: {getLogger: () => logger}},
  './lib/build-linux': {buildLinuxConfig: configuration, buildLinuxWrapper: build('linux')},
  './lib/build-macos': {buildMacOSConfig: configuration, buildMacOSWrapper: build('macos')},
  './lib/build-windows': {buildWindowsConfig: configuration, buildWindowsWrapper: build('windows')},
  './lib/build-windows-installer': {
    buildWindowsInstallerConfig: configuration,
    buildWindowsInstaller: build('windows-installer'),
  },
  './lib/build-windows-msi': {buildWindowsMsiConfig: configuration, buildWindowsMsi: build('windows-msi')},
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (replacements[request]) return replacements[request];
  if (request.startsWith('./lib/build-') || request === 'electron-packager' || request === '@electron/packager')
    throw new Error('Unstubbed native packaging module in CLI fixture.');
  return load.call(this, request, parent, isMain);
};
