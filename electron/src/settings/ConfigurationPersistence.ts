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

import fs from 'fs-extra';
import * as logdown from 'logdown';

import {randomUUID} from 'crypto';
import * as path from 'path';

import {SchemaUpdater} from './SchemaUpdater';

import {getLogger} from '../logging/getLogger';

class ConfigurationPersistence {
  private readonly configFile: string;
  private readonly logger: logdown.Logger;

  constructor() {
    this.configFile = SchemaUpdater.updateToVersion1();
    this.logger = getLogger(path.basename(__filename));

    if (typeof global._ConfigurationPersistence === 'undefined') {
      global._ConfigurationPersistence = this.readFromFile();
    }

    this.logger.info('Initializing ConfigurationPersistence');
  }

  delete(name: string): true {
    this.logger.info(`Deleting "${name}"`);
    delete global._ConfigurationPersistence[name];
    return true;
  }

  save<T>(name: string, value: T): true {
    this.logger.info(`Saving "${name}"`);
    global._ConfigurationPersistence[name] = value;
    return true;
  }

  restore<T>(name: string, defaultValue?: T): T {
    this.logger.info(`Restoring "${name}"`);
    const value = global._ConfigurationPersistence[name];
    return typeof value !== 'undefined' ? value : defaultValue;
  }

  persistToFile(): void {
    this.logger.info(`Saving configuration to persistent storage in "${this.configFile}"`);
    let temporary: string | undefined;
    try {
      const value = global._ConfigurationPersistence;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid settings object.');
      }
      const serialized = JSON.stringify(value, null, 2);
      fs.mkdirSync(path.dirname(this.configFile), {recursive: true, mode: 0o700});
      const stagingPath = `${this.configFile}.${randomUUID()}.tmp`;
      const descriptor = fs.openSync(stagingPath, 'wx', 0o600);
      temporary = stagingPath;
      try {
        fs.writeFileSync(descriptor, serialized);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.configFile);
      temporary = undefined;
    } catch {
      this.logger.error('Settings persistence failed.');
      throw new Error('Settings persistence failed.');
    } finally {
      if (temporary) {
        try {
          fs.unlinkSync(temporary);
        } catch {
          this.logger.warn('Could not remove a temporary settings file.');
        }
      }
    }
  }

  readFromFile(): Record<string, any> {
    this.logger.info(`Reading config file from "${this.configFile}" ...`);
    try {
      const configContent: unknown = fs.readJSONSync(this.configFile);
      if (!configContent || typeof configContent !== 'object' || Array.isArray(configContent)) {
        throw new Error('Invalid settings object.');
      }
      this.logger.info('Read configuration');
      return configContent as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.logger.info('No config found');
        const schemataKeys = Object.keys(SchemaUpdater.SCHEMATA);
        return structuredClone(SchemaUpdater.SCHEMATA[schemataKeys[schemataKeys.length - 1]]);
      }
      this.logger.error('Settings could not be read; the existing file was preserved.');
      throw new Error('Settings could not be read.');
    }
  }
}

export const settings = new ConfigurationPersistence();
