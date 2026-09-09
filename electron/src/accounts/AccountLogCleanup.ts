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

import {lstat, readdir, realpath, rm} from 'node:fs/promises';
import path from 'node:path';

import {ValidationUtil} from '@wireapp/commons';

import {parseLegacyAccountLogDirectory} from '../lib/accountLogDeletion';

const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT';

// Main-owned paths only. Unlike legacy cleanup, failures must retain the account for retry.
export async function deleteNativeAccountLogs(accountId: string, logDirectory: string): Promise<void> {
  if (!ValidationUtil.isUUIDv4(accountId)) {
    throw new Error('Invalid account identity for log cleanup.');
  }
  try {
    const metadata = await lstat(logDirectory);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
      throw new Error('Unsafe or linked log root.');
    }
  } catch (error) {
    if (isMissing(error)) {
      return;
    }
    throw error;
  }
  const root = await realpath(logDirectory);
  const targets = [path.join(root, accountId)];
  for (const entry of await readdir(root)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
      targets.push(path.join(root, entry, 'accounts', accountId));
    } else {
      const legacy = parseLegacyAccountLogDirectory(entry);
      if (legacy.isJust && legacy.value.accountId === accountId) {
        targets.push(path.join(root, entry));
      }
    }
  }
  for (const target of targets) {
    let current = root;
    let missing = false;
    for (const segment of path.relative(root, target).split(path.sep)) {
      current = path.join(current, segment);
      try {
        const metadata = await lstat(current);
        if (metadata.isSymbolicLink() || !metadata.isDirectory() || (await realpath(current)) !== current) {
          throw new Error('Unsafe or linked account log path.');
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
        missing = true;
        break;
      }
    }
    if (!missing) {
      await rm(target, {recursive: true, force: true});
    }
  }
}
