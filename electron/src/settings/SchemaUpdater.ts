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

import * as Electron from 'electron';
import fs from 'fs-extra';

import {randomUUID} from 'crypto';
import * as path from 'path';

import {getLogger} from '../logging/getLogger';
import {readRendererUserDataPath} from '../runtime/rendererRuntimeArguments';

const logger = getLogger(path.basename(__filename));

const getDefaultConfigPaths = (): readonly [string, string] => {
  const userDataPath = Electron.app?.getPath('userData') ?? readRendererUserDataPath();
  if (!userDataPath) {
    throw new Error('Electron user-data path is unavailable.');
  }
  return [path.join(userDataPath, 'init.json'), path.join(userDataPath, 'config/init.json')];
};

export class SchemaUpdater {
  static SCHEMATA: Record<string, any> = {
    VERSION_1: {
      configVersion: 1,
    },
  };

  static updateToVersion1(configFileV0?: string, configFileV1?: string): string {
    if (!configFileV0 || !configFileV1) {
      const defaults = getDefaultConfigPaths();
      configFileV0 ??= defaults[0];
      configFileV1 ??= defaults[1];
    }
    // A completed migration is authoritative, including when an interrupted
    // cleanup left the old file behind. Never overwrite it with legacy data.
    if (fs.existsSync(configFileV1) || !fs.existsSync(configFileV0)) {
      return configFileV1;
    }

    let temporary: string | undefined;
    try {
      const legacy: unknown = fs.readJSONSync(configFileV0);
      if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) {
        throw new Error('Invalid settings object.');
      }
      const config = {...SchemaUpdater.SCHEMATA.VERSION_1, ...legacy};
      const serialized = JSON.stringify(config, null, 2);
      fs.mkdirSync(path.dirname(configFileV1), {recursive: true, mode: 0o700});
      const stagingPath = `${configFileV1}.${randomUUID()}.tmp`;
      const descriptor = fs.openSync(stagingPath, 'wx', 0o600);
      temporary = stagingPath;
      try {
        fs.writeFileSync(descriptor, serialized);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      // Publish complete bytes without replacing a destination created by
      // another process. Both names are on the same filesystem. If linking is
      // unsupported, fail safely with the original legacy file still intact.
      fs.linkSync(temporary, configFileV1);
      fs.unlinkSync(configFileV0);
    } catch {
      // Parser and filesystem errors can contain settings or sensitive paths.
      // Do not attach the original error as a cause or forward it to logging.
      logger.error('Settings migration failed; existing configuration files were preserved.');
      throw new Error('Settings migration failed.');
    } finally {
      if (temporary) {
        try {
          fs.unlinkSync(temporary);
        } catch {
          logger.warn('Could not remove a temporary settings migration file.');
        }
      }
    }

    return configFileV1;
  }
}
