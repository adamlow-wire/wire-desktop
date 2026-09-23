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

import {notarize} from '@electron/notarize';
import {flatAsync as buildPkg, signAsync} from '@electron/osx-sign';
import electronPackager, {ArchOption} from 'electron-packager';
import fs from 'fs-extra';

import path from 'path';

import {flipElectronFuses, getCommonConfig} from './commonConfig';
import {CommonConfig, MacOSConfig} from './Config';
import {createPackageIgnore} from './packageInputs';

import {backupFiles, getLogger, restoreFiles} from '../../bin-utils';

const libraryName = path.basename(__filename).replace('.ts', '');
const logger = getLogger('build-tools', libraryName);
const mainDir = path.resolve(__dirname, '../../../');

interface MacOSConfigResult {
  macOSConfig: MacOSConfig;
  packagerConfig: electronPackager.Options;
}

export async function buildMacOSConfig(
  wireJsonPath: string = path.join(mainDir, 'electron/wire.json'),
  envFilePath: string = path.join(mainDir, '.env.defaults'),
  signManually?: boolean,
  architecture: ArchOption = 'universal',
): Promise<MacOSConfigResult> {
  const wireJsonResolved = path.resolve(wireJsonPath);
  const envFileResolved = path.resolve(envFilePath);
  const plistInfoResolved = path.resolve('resources/macos/Info.plist.json');
  const plistEntries = await fs.readJson(plistInfoResolved);
  const {commonConfig} = await getCommonConfig(envFileResolved, wireJsonResolved);

  const macOSDefaultConfig: MacOSConfig = {
    appleExportComplianceCode: null,
    bundleId: 'com.wearezeta.zclient.mac',
    category: 'public.app-category.social-networking',
    certNameApplication: null,
    certNameInstaller: null,
    electronMirror: null,
    notarizeAppleId: null,
    notarizeApplePassword: null,
    notarizeTeamId: null,
  };

  const macOSConfig: MacOSConfig = {
    ...macOSDefaultConfig,
    appleExportComplianceCode: process.env.APPLE_EXPORT_COMPLIANCE_CODE || macOSDefaultConfig.appleExportComplianceCode,
    bundleId: process.env.MACOS_BUNDLE_ID || macOSDefaultConfig.bundleId,
    certNameApplication: process.env.MACOS_CERTIFICATE_NAME_APPLICATION || macOSDefaultConfig.certNameApplication,
    certNameInstaller: process.env.MACOS_CERTIFICATE_NAME_INSTALLER || macOSDefaultConfig.certNameInstaller,
    electronMirror: process.env.MACOS_ELECTRON_MIRROR_URL || macOSDefaultConfig.electronMirror,
    notarizeAppleId: process.env.MACOS_NOTARIZE_APPLE_ID || macOSDefaultConfig.notarizeAppleId,
    notarizeApplePassword: process.env.MACOS_NOTARIZE_APPLE_PASSWORD || macOSDefaultConfig.notarizeApplePassword,
    notarizeTeamId: process.env.MACOS_NOTARIZE_TEAM_ID || macOSDefaultConfig.notarizeTeamId,
  };

  if (macOSConfig.appleExportComplianceCode) {
    plistEntries['ITSAppUsesNonExemptEncryption'] = true;
    plistEntries['ITSEncryptionExportComplianceCode'] = macOSConfig.appleExportComplianceCode;
  }

  const packagerConfig: electronPackager.Options = {
    appBundleId: macOSConfig.bundleId,
    appCategoryType: 'public.app-category.social-networking',
    appCopyright: commonConfig.copyright,
    appVersion: commonConfig.version,
    arch: architecture,
    asar: commonConfig.enableAsar,
    buildVersion: commonConfig.buildNumber,
    darwinDarkModeSupport: true,
    dir: '.',
    extendInfo: plistEntries,
    helperBundleId: `${macOSConfig.bundleId}.helper`,
    icon: 'resources/macos/logo.icns',
    ignore: createPackageIgnore(path.resolve('.'), commonConfig.electronDirectory),
    name: commonConfig.name,
    osxUniversal: {
      mergeASARs: true,
    },
    out: commonConfig.buildDir,
    overwrite: true,
    platform: 'mas', //  Mac App Store
    protocols: [{name: `${commonConfig.name} Core Protocol`, schemes: [commonConfig.customProtocolName]}],
    prune: true,
    quiet: false,
  };

  if (macOSConfig.electronMirror) {
    packagerConfig.download = {
      mirrorOptions: {
        mirror: macOSConfig.electronMirror,
      },
    };
  }

  if (macOSConfig.certNameInstaller && !macOSConfig.certNameApplication) {
    throw new Error('Installer signing requires an application signing identity.');
  }
  if (!signManually) {
    if (macOSConfig.certNameApplication) {
      packagerConfig.osxSign = {
        optionsForFile: () => ({
          entitlements: 'resources/macos/entitlements/parent.plist',
        }),
        identity: macOSConfig.certNameApplication,
      };
    }

    const {notarizeAppleId, notarizeApplePassword, notarizeTeamId} = macOSConfig;
    if (notarizeAppleId || notarizeApplePassword || notarizeTeamId) {
      if (!notarizeAppleId || !notarizeApplePassword || !notarizeTeamId || !macOSConfig.certNameApplication) {
        throw new Error('Notarization requires an application signing identity, Apple ID, password and team ID.');
      }
      packagerConfig.osxNotarize = {
        appleId: notarizeAppleId,
        appleIdPassword: notarizeApplePassword,
        tool: 'notarytool',
        teamId: notarizeTeamId,
      };
    }
  }

  return {macOSConfig, packagerConfig};
}

export async function buildMacOSWrapper(
  packagerConfig: electronPackager.Options,
  macOSConfig: MacOSConfig,
  packageJsonPath: string,
  wireJsonPath: string,
  envFilePath: string,
  signManually?: boolean,
): Promise<void> {
  const wireJsonResolved = path.resolve(wireJsonPath);
  const packageJsonResolved = path.resolve(packageJsonPath);
  const envFileResolved = path.resolve(envFilePath);
  const {commonConfig} = await getCommonConfig(envFileResolved, wireJsonResolved);

  logger.info(`Building ${commonConfig.name} ${commonConfig.version} for macOS ...`);

  const backup = await backupFiles([packageJsonResolved, wireJsonResolved]);
  try {
    const packageJsonContent = await fs.readJson(packageJsonResolved);

    await fs.writeJson(
      packageJsonResolved,
      {...packageJsonContent, productName: commonConfig.name, version: commonConfig.version},
      {spaces: 2},
    );
    // Source configuration cannot enable updates in an unsigned review package.
    // Signing failures below must prevent this candidate from being published.
    const macAutoUpdateEnabled =
      commonConfig.environment === 'internal' &&
      Boolean(macOSConfig.certNameApplication) &&
      macOSConfig.certNameApplication !== '-' &&
      Boolean(signManually || packagerConfig.osxSign);
    await fs.writeJson(wireJsonResolved, {...commonConfig, macAutoUpdateEnabled}, {spaces: 2});
    // Packager signs before returning and swallows signing rejection. Keep all
    // native signing under our control, after the final fuse mutation.
    const {osxSign, osxNotarize, ...unsignedConfig} = packagerConfig;
    const [buildDir] = await electronPackager(unsignedConfig);

    logger.log(`Built app in "${buildDir}".`);

    const appFile = path.join(buildDir, `${commonConfig.name}.app`);
    await flipElectronFuses(appFile);

    const pkgFile = path.join(commonConfig.distDir, `${commonConfig.name}.pkg`);
    if (signManually) {
      await manualMacOSSign(appFile, pkgFile, commonConfig, macOSConfig);
    } else {
      if (osxSign) {
        await signAsync({
          ...(typeof osxSign === 'object' ? osxSign : {}),
          app: appFile,
          platform: packagerConfig.platform === 'darwin' ? 'darwin' : 'mas',
          version: packagerConfig.electronVersion,
        });
      }
      if (osxNotarize) {
        if (!osxSign || osxNotarize.tool !== 'notarytool') {
          throw new Error('Notarization requires a signed application and notarytool configuration.');
        }
        await notarize({...osxNotarize, appPath: appFile});
      }
      if (macOSConfig.certNameInstaller) {
        await fs.ensureDir(commonConfig.distDir);
        await buildPkg({
          app: appFile,
          identity: macOSConfig.certNameInstaller,
          pkg: pkgFile,
          platform: packagerConfig.platform === 'darwin' ? 'darwin' : 'mas',
        });
      }
    }
    if (macOSConfig.certNameInstaller) {
      logger.log(`Built installer in "${commonConfig.distDir}".`);
    }
  } catch (error) {
    logger.error('Packaging failed.');
    throw error;
  } finally {
    await restoreFiles(backup);
  }
}

export async function manualMacOSSign(
  appFile: string,
  pkgFile: string,
  commonConfig: CommonConfig,
  macOSConfig: MacOSConfig,
): Promise<void> {
  if (macOSConfig.certNameInstaller && !macOSConfig.certNameApplication) {
    throw new Error('Manual installer signing requires an application signing identity.');
  }
  if (macOSConfig.certNameApplication) {
    const applicationPath = path.resolve(appFile);
    const mainExecutable = path.join(applicationPath, 'Contents', 'MacOS', commonConfig.name);
    // Discover actual nested code rather than maintaining a stale helper list.
    // The library verifies the resulting signature and rejects native failures.
    await signAsync({
      app: applicationPath,
      identity: macOSConfig.certNameApplication,
      platform: 'mas',
      optionsForFile: file => ({
        entitlements:
          file === applicationPath || file === mainExecutable
            ? 'resources/macos/entitlements/parent.plist'
            : 'resources/macos/entitlements/child.plist',
      }),
    });
    if (macOSConfig.certNameInstaller) {
      await fs.ensureDir(path.dirname(pkgFile));
      await buildPkg({app: appFile, pkg: pkgFile, identity: macOSConfig.certNameInstaller, platform: 'mas'});
    }
  }
}
