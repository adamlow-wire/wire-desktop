/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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

// https://github.com/atom/atom/blob/ce18e1b7d65808c42df5b612d124935ab5c06490/src/main-process/squirrel-update.js

import * as childProcess from 'child_process';
import * as path from 'path';

import {StringUtil} from '@wireapp/commons';

import {createShortcuts, removeShortcuts} from './shortcuts';
import {isSquirrelInstallation as updaterExists} from './squirrelInstallation';

import {getLogger} from '../logging/getLogger';
import * as EnvironmentUtil from '../runtime/EnvironmentUtil';
import * as lifecycle from '../runtime/lifecycle';
import {config, MINUTE_IN_MILLIS, HOUR_IN_MILLIS} from '../settings/config';

const logger = getLogger(path.basename(__filename));

const appFolder = path.resolve(process.execPath, '..');
const rootFolder = path.resolve(appFolder, '..');
const updateDotExe = path.join(rootFolder, 'Update.exe');
const exeName = path.basename(process.execPath);
const exePath = path.join(rootFolder, exeName);

const windowsAppData = process.env.APPDATA;

if (!windowsAppData && EnvironmentUtil.platform.IS_WINDOWS) {
  logger.error('No Windows AppData directory found.');
}

enum SQUIRREL_EVENT {
  INSTALL = '--squirrel-install',
  OBSOLETE = '--squirrel-obsolete',
  UNINSTALL = '--squirrel-uninstall',
  UPDATED = '--squirrel-updated',
}

export function isSquirrelLifecycleEvent(argument: string | undefined = process.argv[1]): boolean {
  return Object.values(SQUIRREL_EVENT).some(event => event === argument);
}

export function isSquirrelInstallation(updaterPath: string = updateDotExe): boolean {
  return updaterExists(updaterPath);
}

function spawn(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let spawnedProcess: childProcess.ChildProcess;
    try {
      spawnedProcess = childProcess.spawn(command, args);
    } catch {
      reject(new Error('Windows updater could not start.'));
      return;
    }

    // Update.exe output can contain the configured feed or native diagnostics.
    // Drain both pipes without retaining their untrusted contents in app logs.
    spawnedProcess.stdout?.on('data', () => undefined);
    spawnedProcess.stderr?.on('data', () => undefined);
    spawnedProcess.once('error', () => reject(new Error('Windows updater could not start.')));
    spawnedProcess.once('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Windows updater exited unsuccessfully.'));
      }
    });
  });
}

async function spawnUpdate(args: string[]): Promise<void> {
  if (!isSquirrelInstallation()) {
    logger.info('Windows updater is not installed.');
    return;
  }

  await spawn(updateDotExe, args);
}

export async function installUpdate(): Promise<void> {
  logger.info('Checking for Windows updates.');
  await spawnUpdate(['--update', EnvironmentUtil.app.UPDATE_URL_WIN]);
}

async function scheduleUpdate(): Promise<void> {
  const squirrelDelay = config.squirrelUpdateInterval.DELAY;
  const squirrelInterval = config.squirrelUpdateInterval.INTERVAL;
  const nextCheck = squirrelDelay / MINUTE_IN_MILLIS;
  const regularCheck = squirrelInterval / HOUR_IN_MILLIS;
  const readableNextCheck = `${nextCheck} ${StringUtil.pluralize('minute', nextCheck)}`;
  const readableRegularCheck = `${regularCheck} ${StringUtil.pluralize('hour', regularCheck)}`;
  logger.info(`Scheduling Windows update to check in "${readableNextCheck}" and every "${readableRegularCheck}" ...`);

  const runScheduledUpdate = () => {
    void installUpdate().catch(() => logger.error('Windows updater check failed.'));
  };
  setTimeout(runScheduledUpdate, squirrelDelay);
  setInterval(runScheduledUpdate, squirrelInterval);
}

export async function handleSquirrelArgs(): Promise<void> {
  const squirrelEvent = process.argv[1];
  // See https://github.com/Squirrel/Squirrel.Windows/blob/develop/docs/using/custom-squirrel-events-non-cs.md

  switch (squirrelEvent) {
    case SQUIRREL_EVENT.INSTALL:
    case SQUIRREL_EVENT.UPDATED: {
      logger.info(`Creating shortcuts for exe ${exePath}...`);
      await createShortcuts(exePath);
      await lifecycle.quit(true);
      return;
    }

    case SQUIRREL_EVENT.UNINSTALL: {
      await removeShortcuts();
      await lifecycle.quit(true);
      return;
    }

    case SQUIRREL_EVENT.OBSOLETE: {
      // This is called when the app is updated but the old version is still running
      await lifecycle.quit(true);
      return;
    }
  }

  await scheduleUpdate();
}
