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
const fs = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
assert.equal(process.versions.electron, undefined);
const repo = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-signing-fixture-'));
const mode = process.env.SIGNING_MODE;
const phase = process.env.SIGNING_PHASE;
const secret = 'synthetic-signing-failure-secret';
const failure = new Error(secret);
const events = [];
const diagnostics = [];
const signingOptions = [];
let mainEntitlements;
const notaryOptions = [];
const installerOptions = [];
const sign = async options => {
  mainEntitlements = options.optionsForFile?.(path.join(appFile, 'Contents/MacOS/Owned'))?.entitlements;
  signingOptions.push({
    app: options.app,
    identity: options.identity,
    platform: options.platform,
    parent: options.optionsForFile?.(appFile)?.entitlements,
    child: options.optionsForFile?.(path.join(appFile, 'Contents/Frameworks/Owned Helper.app'))?.entitlements,
  });
  await step('sign');
};
const installer = async options => {
  installerOptions.push({app: options.app, identity: options.identity, platform: options.platform});
  await step('installer');
};
const packageFile = path.join(root, 'package.json');
const wireFile = path.join(root, 'wire.json');
const appFile = path.join(root, 'Owned.app');
const originals = ['{"name":"original"}\n', '{"name":"original-wire"}\r\n'];
fs.writeFileSync(packageFile, originals[0]);
fs.writeFileSync(wireFile, originals[1]);
os.tmpdir = () => root;
const step = async name => {
  events.push(name);
  if (phase === name) throw failure;
};
const logger = Object.fromEntries(
  ['info', 'warn', 'error', 'log'].map(level => [level, (...args) => diagnostics.push(args.map(String).join(' '))]),
);
const load = Module._load;
let MacApp;
Module._load = function (request, parent, isMain) {
  if (request === '@wireapp/commons') return {LogFactory: {getLogger: () => logger}};
  if (request === '@electron/osx-sign')
    return {
      signApp: sign,
      signAsync: sign,
      flatAsync: installer,
      buildPkg: installer,
    };
  if (request === '@electron/notarize')
    return {
      notarize: async options => {
        notaryOptions.push({appPath: options.appPath, teamId: options.teamId, tool: options.tool});
        await step('notarize');
      },
    };
  if (request === './commonConfig')
    return {
      getCommonConfig: async () => ({
        commonConfig: {name: 'Owned', version: '1.0.0', distDir: root, electronDirectory: 'electron'},
      }),
      flipElectronFuses: async () => step('fuses'),
    };
  if (request === '../../bin-utils') {
    const actual = load.call(this, path.join(repo, 'bin/bin-utils.ts'), parent, isMain);
    return {
      ...actual,
      execAsync: async command => {
        try {
          await step(command.startsWith('productbuild') ? 'installer' : 'sign');
          return {stdout: '', stderr: ''};
        } catch {
          return {stdout: '', stderr: secret};
        }
      },
    };
  }
  if (request === 'electron-packager')
    return async options => {
      await step('package');
      // Use the installed packager's real sign-error handling; only native tools are inert.
      const context = {opts: {...options, electronVersion: '43.4.0'}, renamedAppPath: appFile, bundleName: 'Owned'};
      await MacApp.prototype.signAppIfSpecified.call(context);
      await MacApp.prototype.notarizeAppIfSpecified.call(context);
      return [phase === 'relative' ? path.relative(repo, root) : root];
    };
  return load.call(this, request, parent, isMain);
};
(async () => {
  try {
    MacApp = require('electron-packager/src/mac').App;
    if (mode !== 'unsigned') {
      process.env.MACOS_CERTIFICATE_NAME_APPLICATION = "Fixture ' application identity";
      process.env.MACOS_CERTIFICATE_NAME_INSTALLER = "Fixture ' installer identity";
      process.env.MACOS_NOTARIZE_APPLE_ID = 'fixture@example.invalid';
      process.env.MACOS_NOTARIZE_APPLE_PASSWORD = 'synthetic-notary-password';
      process.env.MACOS_NOTARIZE_TEAM_ID = 'FIXTURETEAM';
    }
    const {buildMacOSConfig, buildMacOSWrapper} = require(path.join(repo, 'bin/build-tools/lib/build-macos.ts'));
    if (mode === 'automatic-missing-team') delete process.env.MACOS_NOTARIZE_TEAM_ID;
    if (mode.endsWith('missing-sign')) delete process.env.MACOS_CERTIFICATE_NAME_APPLICATION;
    if (mode.endsWith('application-only') || mode === 'automatic-installer-only') {
      delete process.env.MACOS_NOTARIZE_APPLE_ID;
      delete process.env.MACOS_NOTARIZE_APPLE_PASSWORD;
      delete process.env.MACOS_NOTARIZE_TEAM_ID;
    }
    if (mode.endsWith('application-only')) delete process.env.MACOS_CERTIFICATE_NAME_INSTALLER;
    if (mode === 'automatic-installer-only') delete process.env.MACOS_CERTIFICATE_NAME_APPLICATION;
    const manual = mode.startsWith('manual');
    let error;
    try {
      const {packagerConfig, macOSConfig} = await buildMacOSConfig(wireFile, 'unused', manual);
      await buildMacOSWrapper(packagerConfig, macOSConfig, packageFile, wireFile, 'unused', manual);
    } catch (caught) {
      error = caught;
    }
    process.stdout.write(
      JSON.stringify({
        events,
        signingOptions,
        mainEntitlements,
        notaryOptions,
        installerOptions,
        appFile,
        rejected: Boolean(error),
        exactFailure: error === failure,
        secretLogged: diagnostics.some(text => text.includes(secret)),
        metadataRestored:
          fs.readFileSync(packageFile, 'utf8') === originals[0] && fs.readFileSync(wireFile, 'utf8') === originals[1],
      }) + '\n',
    );
  } finally {
    await fs.remove(root);
  }
})().catch(() => {
  process.stderr.write('Signing fixture infrastructure failed.\n');
  process.exitCode = 1;
});
