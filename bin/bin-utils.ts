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

import {OptionValues} from 'commander';
import fs from 'fs-extra';
import {v4 as uuidv4} from 'uuid';

import {exec} from 'child_process';
import os from 'os';
import path from 'path';
import {promisify} from 'util';

import {LogFactory, Logger} from '@wireapp/commons';

interface BackupResult {
  backupPaths: string[];
  originalPaths: string[];
  tempDir: string;
}

const createTempDir = () => fs.mkdtemp(path.join(os.tmpdir(), 'wire-build-'));

export async function backupFiles(filePaths: string[]): Promise<BackupResult> {
  const originalPaths = filePaths.map(filePath => path.resolve(filePath));
  const tempDir = await createTempDir();
  const backupPaths = originalPaths.map((filePath, index) => path.join(tempDir, `${index}-${path.basename(filePath)}`));
  // Finish all copies before cleanup: a rejected Promise.all can leave a copy
  // recreating the temporary directory after it has been removed.
  const results = await Promise.allSettled(
    originalPaths.map((filePath, index) => fs.copy(filePath, backupPaths[index])),
  );
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failure) {
    await fs.remove(tempDir);
    throw failure.reason;
  }

  return {backupPaths, originalPaths, tempDir};
}

export async function restoreFiles({originalPaths, backupPaths, tempDir}: BackupResult): Promise<void> {
  const results = await Promise.allSettled(
    backupPaths.map((tempPath, index) => fs.copy(tempPath, originalPaths[index], {overwrite: true})),
  );
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  // Keep every backup available for a recovery attempt if any restore fails.
  if (failure) {
    throw failure.reason;
  }
  await fs.remove(tempDir);
}

export const generateUUID = () => uuidv4();

export const getLogger = (namespace: string, name: string): Logger =>
  LogFactory.getLogger(name, {forceEnable: true, namespace: `@wireapp/${namespace}`, separator: '/'});

export function checkCommanderOptions(
  commanderInstance: OptionValues,
  logdownInstance: Logger,
  options: string[],
): void {
  options.forEach(option => {
    if (!commanderInstance.hasOwnProperty(option)) {
      logdownInstance.error(`Required option "${option}" was not provided.`);
      commanderInstance.outputHelp();
      process.exit(1);
    }
  });
}

interface ExecResult {
  stderr: string;
  stdout: string;
}

export async function execAsync(command: string): Promise<ExecResult> {
  let stderr = '';
  let stdout = '';

  try {
    const execResult = await promisify(exec)(command);
    stdout = execResult.stdout.toString();
    stderr = execResult.stderr.toString();
  } catch (error: any) {
    stderr = error.toString();
  }

  return {stderr: stderr.trim(), stdout: stdout.trim()};
}
