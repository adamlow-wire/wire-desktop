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

import fs from 'fs-extra';
import * as logdown from 'logdown';
import {stub} from 'sinon';

import {strict as assert} from 'assert';
import {tmpdir} from 'os';
import * as path from 'path';

import {settings} from './ConfigurationPersistence';
import {SchemaUpdater} from './SchemaUpdater';
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

  for (const operation of ['openSync', 'writeFileSync', 'fsyncSync', 'renameSync'] as const) {
    it(`[regression] preserves the previous file after ${operation} failure and recovers`, () => {
      const previous = '{ "configVersion": 1, "customSetting": "previous" }\n';
      fs.outputFileSync(filename, previous);
      const failure = stub(fs, operation).throws(new Error('fixture-secret-only'));
      try {
        assert.throws(() => settings.persistToFile(), /^Error: Settings persistence failed\.$/);
      } finally {
        failure.restore();
      }
      assert.equal(fs.readFileSync(filename, 'utf8'), previous);
      assert.deepEqual(fs.readdirSync(path.dirname(filename)), ['init.json']);
      settings.persistToFile();
      assert.deepEqual(settings.readFromFile(), global._ConfigurationPersistence);
    });
  }

  it('[regression] keeps incomplete write bytes out of the live configuration', () => {
    fs.outputJSONSync(filename, {configVersion: 1, customSetting: 'previous'});
    const previous = fs.readFileSync(filename);
    const write = fs.writeFileSync;
    const partial = stub(fs, 'writeFileSync').callsFake(file => {
      write(file, '{"incomplete":');
      throw new Error('synthetic full disk');
    });
    try {
      assert.throws(() => settings.persistToFile(), /Settings persistence failed/);
    } finally {
      partial.restore();
    }
    assert.deepEqual(fs.readFileSync(filename), previous);
    assert.deepEqual(fs.readdirSync(path.dirname(filename)), ['init.json']);
  });

  it('[regression] does not log or return malformed settings contents in errors', () => {
    const canary = 'fixture-secret-only';
    fs.outputFileSync(filename, canary);
    const diagnostics: string[] = [];
    const capture: logdown.TransportFunction = options => {
      if (options.instance.includes('ConfigurationPersistence')) {
        diagnostics.push(String(options.msg), ...options.args.map(value => String(value)));
      }
    };
    logdown.transports.push(capture);
    try {
      assert.throws(() => settings.readFromFile(), /^Error: Settings could not be read\.$/);
      assert.equal(
        diagnostics.some(message => message.includes(canary)),
        false,
      );
    } finally {
      logdown.transports.splice(logdown.transports.indexOf(capture), 1);
    }
  });

  it('[regression] rejects invalid in-memory values without replacing the last valid file', () => {
    fs.outputJSONSync(filename, {configVersion: 1, customSetting: 'previous'});
    const previous = fs.readFileSync(filename);
    for (const value of [null, [], 'invalid']) {
      global._ConfigurationPersistence = value as unknown as Record<string, unknown>;
      assert.throws(() => settings.persistToFile(), /Settings persistence failed/);
      assert.deepEqual(fs.readFileSync(filename), previous);
    }
    assert.deepEqual(fs.readdirSync(path.dirname(filename)), ['init.json']);
  });

  it('[regression] ignores a leftover staging file after publication and cleanup both fail', () => {
    fs.outputJSONSync(filename, {configVersion: 1, customSetting: 'previous'});
    const previous = fs.readFileSync(filename);
    const publish = stub(fs, 'renameSync').throws(new Error('synthetic publication failure'));
    const cleanup = stub(fs, 'unlinkSync').throws(new Error('synthetic cleanup failure'));
    try {
      assert.throws(() => settings.persistToFile(), /Settings persistence failed/);
    } finally {
      publish.restore();
      cleanup.restore();
    }
    assert.deepEqual(fs.readFileSync(filename), previous);
    assert.deepEqual(settings.readFromFile(), {configVersion: 1, customSetting: 'previous'});
    assert.equal(fs.readdirSync(path.dirname(filename)).filter(name => name.endsWith('.tmp')).length, 1);
    settings.persistToFile();
    assert.deepEqual(settings.readFromFile(), global._ConfigurationPersistence);
  });

  it('preserves already loaded in-memory settings when another persistence instance is constructed', () => {
    fs.outputJSONSync(filename, {configVersion: 1, customSetting: 'older disk value'});
    const loaded = global._ConfigurationPersistence;
    const migration = stub(SchemaUpdater, 'updateToVersion1').returns(filename);
    try {
      Reflect.construct(settings.constructor, []);
      assert.strictEqual(global._ConfigurationPersistence, loaded);
      assert.strictEqual(settings.restore('customSetting'), 'new value');
    } finally {
      migration.restore();
    }
  });
});
