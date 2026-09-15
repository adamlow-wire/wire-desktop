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

import * as fs from 'fs-extra';
import * as logdown from 'logdown';

import {strict as assert} from 'assert';
import {tmpdir} from 'os';
import * as path from 'path';

import {settings} from './ConfigurationPersistence';
import {SettingsType} from './SettingsType';

describe('ConfigurationPersistence diagnostics', () => {
  for (const operation of ['save', 'persistToFile', 'readFromFile'] as const) {
    it(`[security-target][CAP-005][INV-010] preserves settings without logging credentials during ${operation}`, () => {
      const original = global._ConfigurationPersistence;
      const secret = 'synthetic-proxy-password';
      const value = `http://fixture-user:${secret}@proxy.invalid:3128`;
      const configuration = {configVersion: 1, [SettingsType.PROXY_SERVER_URL]: value};
      global._ConfigurationPersistence = operation === 'save' ? {configVersion: 1} : {...configuration};
      const directory = fs.mkdtempSync(path.join(tmpdir(), 'wire-settings-diagnostics-'));
      const configFile = path.join(directory, 'init.json');
      const originalPath = Reflect.get(settings, 'configFile');
      Reflect.set(settings, 'configFile', configFile);
      fs.writeJSONSync(configFile, operation === 'readFromFile' ? configuration : {});
      const diagnostics: string[] = [];
      const capture: logdown.TransportFunction = options => {
        if (options.instance.includes('ConfigurationPersistence')) {
          diagnostics.push(JSON.stringify({args: options.args, message: options.msg}));
        }
      };
      logdown.transports.push(capture);
      try {
        if (operation === 'save') {
          assert.equal(settings.save(SettingsType.PROXY_SERVER_URL, value), true);
          assert.equal(settings.restore(SettingsType.PROXY_SERVER_URL), value);
        } else if (operation === 'persistToFile') {
          settings.persistToFile();
          assert.deepEqual(fs.readJSONSync(configFile), configuration);
        } else {
          assert.deepEqual(settings.readFromFile(), configuration);
        }
        assert.ok(diagnostics.length > 0, 'Operation diagnostics remain enabled');
        assert.equal(
          diagnostics.some(message => message.includes(secret)),
          false,
          'Credential reached diagnostics',
        );
      } finally {
        logdown.transports.splice(logdown.transports.indexOf(capture), 1);
        global._ConfigurationPersistence = original;
        Reflect.set(settings, 'configFile', originalPath);
        fs.removeSync(directory);
      }
    });
  }
});

describe('[PKG-003][DCP-021] settings persistence recovery', () => {
  let directory: string;
  let filename: string;
  let originalPath: string;
  let originalSettings: Record<string, unknown>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(tmpdir(), 'wire-settings-recovery-'));
    filename = path.join(directory, 'config', 'init.json');
    originalPath = Reflect.get(settings, 'configFile');
    originalSettings = global._ConfigurationPersistence;
    Reflect.set(settings, 'configFile', filename);
    global._ConfigurationPersistence = {configVersion: 1, customSetting: 'new value'};
  });

  afterEach(() => {
    Reflect.set(settings, 'configFile', originalPath);
    global._ConfigurationPersistence = originalSettings;
    fs.removeSync(directory);
  });

  it('round-trips valid settings and creates a missing config directory', () => {
    settings.persistToFile();
    assert.deepEqual(settings.readFromFile(), global._ConfigurationPersistence);
  });

  it('[security-target] returns independent defaults for a missing file', () => {
    const first = settings.readFromFile();
    const second = settings.readFromFile();
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
  });

  it('[security-target] rejects corrupt and non-object files instead of replacing them with defaults', () => {
    for (const contents of ['broken', 'null', '[]', '"text"']) {
      fs.outputFileSync(filename, contents);
      assert.throws(() => settings.readFromFile());
      assert.equal(fs.readFileSync(filename, 'utf8'), contents);
    }
  });

  it('[security-target] reports a persistence failure and preserves an inaccessible destination', () => {
    fs.writeFileSync(path.dirname(filename), 'parent is a file');
    assert.throws(() => settings.persistToFile());
    assert.equal(fs.readFileSync(path.dirname(filename), 'utf8'), 'parent is a file');
  });
});
