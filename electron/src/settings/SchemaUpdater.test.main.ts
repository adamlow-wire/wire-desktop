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

import {app} from 'electron';
import fs from 'fs-extra';
import * as logdown from 'logdown';
import {stub} from 'sinon';

import {strict as assert} from 'node:assert';
import os from 'node:os';
import path from 'node:path';

import {SchemaUpdater} from './SchemaUpdater';
import {SettingsType} from './SettingsType';

import {createRendererRuntimeArguments} from '../runtime/rendererRuntimeArguments';

describe('[PKG-003][DCP-021][INV-010] settings schema migration', () => {
  let directory: string;
  let legacy: string;
  let current: string;
  let defaults: typeof SchemaUpdater.SCHEMATA;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wire-schema-migration-'));
    legacy = path.join(directory, 'init.json');
    current = path.join(directory, 'config', 'init.json');
    defaults = structuredClone(SchemaUpdater.SCHEMATA);
  });

  afterEach(() => {
    SchemaUpdater.SCHEMATA = defaults;
    fs.removeSync(directory);
  });

  it('migrates legacy values and preserves the existing window-state behavior', () => {
    const original = {
      customSetting: 'retained',
      [SettingsType.FULL_SCREEN]: true,
      [SettingsType.WINDOW_BOUNDS]: {height: 700, width: 1000},
    };
    fs.writeJSONSync(legacy, original);
    assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
    assert.deepEqual(fs.readJSONSync(current), {...original, configVersion: 1});
    assert.equal(fs.existsSync(legacy), false);
  });

  it('leaves an existing current file byte-for-byte unchanged when there is no legacy file', () => {
    const contents = '{ "configVersion": 1, "customSetting": "current" }\n';
    fs.outputFileSync(current, contents);
    assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
    assert.equal(fs.readFileSync(current, 'utf8'), contents);
  });

  it('does not create a configuration when neither version exists', () => {
    assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
    assert.equal(fs.existsSync(legacy), false);
    assert.equal(fs.existsSync(current), false);
  });

  it('[security-target] preserves the authoritative current file and leftover corrupt legacy file', () => {
    const previous = '{ "configVersion": 1, "customSetting": "must survive" }\n';
    const corrupt = 'synthetic malformed legacy content';
    fs.outputFileSync(current, previous);
    fs.writeFileSync(legacy, corrupt);
    assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
    assert.equal(fs.readFileSync(current, 'utf8'), previous);
    assert.equal(fs.readFileSync(legacy, 'utf8'), corrupt);
  });

  it('[security-target] preserves invalid legacy input and fails without creating a replacement', () => {
    for (const contents of ['malformed', 'null', '[]', '"not an object"']) {
      fs.writeFileSync(legacy, contents);
      assert.throws(() => SchemaUpdater.updateToVersion1(legacy, current));
      assert.equal(fs.readFileSync(legacy, 'utf8'), contents);
      assert.equal(fs.existsSync(current), false);
    }
  });

  it('[security-target] does not report success when the destination cannot be written', () => {
    fs.writeJSONSync(legacy, {customSetting: 'must survive'});
    fs.writeFileSync(path.dirname(current), 'parent is a file');
    const previous = fs.readFileSync(legacy);
    assert.throws(() => SchemaUpdater.updateToVersion1(legacy, current));
    assert.deepEqual(fs.readFileSync(legacy), previous);
    assert.equal(fs.readFileSync(path.dirname(current), 'utf8'), 'parent is a file');
  });

  it('[security-target] does not put malformed configuration contents into diagnostics', () => {
    const canary = 'fixture-secret-only';
    fs.writeFileSync(legacy, canary);
    const diagnostics: string[] = [];
    const capture: logdown.TransportFunction = options => {
      if (options.instance.includes('SchemaUpdater')) {
        diagnostics.push(String(options.msg), ...options.args.map(value => String(value)));
      }
    };
    logdown.transports.push(capture);
    try {
      try {
        SchemaUpdater.updateToVersion1(legacy, current);
      } catch {
        // A safe failure is permitted; raw input must never be its diagnostic.
      }
      assert.equal(
        diagnostics.some(message => message.includes(canary)),
        false,
      );
    } finally {
      logdown.transports.splice(logdown.transports.indexOf(capture), 1);
    }
  });

  it('[security-target] does not mutate defaults while migrating user settings', () => {
    fs.writeJSONSync(legacy, {customSetting: 'private to this profile'});
    SchemaUpdater.updateToVersion1(legacy, current);
    assert.deepEqual(SchemaUpdater.SCHEMATA, defaults);
  });

  for (const operation of ['writeFileSync', 'fsyncSync', 'linkSync'] as const) {
    it(`[regression] preserves legacy bytes and removes staging files after ${operation} failure`, () => {
      fs.writeJSONSync(legacy, {customSetting: 'must survive'});
      const original = fs.readFileSync(legacy);
      const failure = stub(fs, operation).throws(new Error('synthetic filesystem failure'));
      try {
        assert.throws(() => SchemaUpdater.updateToVersion1(legacy, current), /^Error: Settings migration failed\.$/);
      } finally {
        failure.restore();
      }
      assert.deepEqual(fs.readFileSync(legacy), original);
      assert.equal(fs.existsSync(current), false);
      assert.deepEqual(fs.readdirSync(path.dirname(current)), []);
      SchemaUpdater.updateToVersion1(legacy, current);
      assert.deepEqual(fs.readJSONSync(current), {configVersion: 1, customSetting: 'must survive'});
    });
  }

  it('[regression] preserves a staging path owned by another writer after an exclusive-open collision', () => {
    fs.writeJSONSync(legacy, {customSetting: 'retained'});
    const previous = fs.readFileSync(legacy);
    const open = fs.openSync;
    let foreignPath = '';
    const collision = stub(fs, 'openSync').callsFake((file, flags, mode) => {
      assert.equal(flags, 'wx');
      assert.equal(mode, 0o600);
      foreignPath = String(file);
      const descriptor = open(file, flags, mode);
      fs.writeFileSync(descriptor, 'other writer');
      fs.closeSync(descriptor);
      throw Object.assign(new Error('synthetic exclusive-open collision'), {code: 'EEXIST'});
    });
    try {
      assert.throws(() => SchemaUpdater.updateToVersion1(legacy, current), /Settings migration failed/);
    } finally {
      collision.restore();
    }
    assert.equal(fs.readFileSync(foreignPath, 'utf8'), 'other writer');
    assert.deepEqual(fs.readFileSync(legacy), previous);
    SchemaUpdater.updateToVersion1(legacy, current);
    assert.equal(fs.readFileSync(foreignPath, 'utf8'), 'other writer');
  });

  it('[regression] never replaces a destination created during migration', () => {
    fs.writeJSONSync(legacy, {customSetting: 'legacy'});
    const originalLink = fs.linkSync;
    const concurrent = '{"configVersion":1,"customSetting":"concurrent"}';
    const publish = stub(fs, 'linkSync').callsFake((source, destination) => {
      fs.writeFileSync(destination, concurrent);
      return originalLink(source, destination);
    });
    try {
      assert.throws(() => SchemaUpdater.updateToVersion1(legacy, current), /Settings migration failed/);
    } finally {
      publish.restore();
    }
    assert.equal(fs.readFileSync(current, 'utf8'), concurrent);
    assert.deepEqual(fs.readJSONSync(legacy), {customSetting: 'legacy'});
    assert.deepEqual(fs.readdirSync(path.dirname(current)), ['init.json']);
  });

  it('[regression] can restart safely after publication succeeds but legacy cleanup fails', () => {
    fs.writeJSONSync(legacy, {customSetting: 'retained'});
    const unlink = fs.unlinkSync;
    const cleanup = stub(fs, 'unlinkSync').callsFake(filename => {
      if (filename === legacy) {
        throw new Error('synthetic legacy cleanup failure');
      }
      return unlink(filename);
    });
    try {
      assert.throws(() => SchemaUpdater.updateToVersion1(legacy, current), /Settings migration failed/);
    } finally {
      cleanup.restore();
    }
    const migrated = fs.readFileSync(current, 'utf8');
    assert.equal(fs.existsSync(legacy), true);
    assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
    assert.equal(fs.readFileSync(current, 'utf8'), migrated);
    assert.deepEqual(fs.readdirSync(path.dirname(current)), ['init.json']);
  });

  it('[regression] retains a complete current file when temporary-file cleanup fails', () => {
    fs.writeJSONSync(legacy, {customSetting: 'retained'});
    const unlink = fs.unlinkSync;
    const cleanup = stub(fs, 'unlinkSync').callsFake(filename => {
      if (String(filename).endsWith('.tmp')) {
        throw new Error('synthetic temporary cleanup failure');
      }
      return unlink(filename);
    });
    try {
      assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
    } finally {
      cleanup.restore();
    }
    assert.equal(fs.existsSync(legacy), false);
    assert.deepEqual(fs.readJSONSync(current), {configVersion: 1, customSetting: 'retained'});
    assert.equal(fs.readdirSync(path.dirname(current)).filter(name => name.endsWith('.tmp')).length, 1);
    assert.equal(SchemaUpdater.updateToVersion1(legacy, current), current);
  });

  it('uses the supplied renderer user-data path when the native path is unavailable', () => {
    const originalArguments = process.argv;
    const nativePath = stub(app, 'getPath').returns(undefined as never);
    process.argv = createRendererRuntimeArguments({locale: 'en', userDataPath: directory});
    fs.writeJSONSync(legacy, {customSetting: 'retained'});
    try {
      assert.equal(SchemaUpdater.updateToVersion1(), current);
      assert.deepEqual(fs.readJSONSync(current), {configVersion: 1, customSetting: 'retained'});
    } finally {
      nativePath.restore();
      process.argv = originalArguments;
    }
  });

  it('refuses migration when neither native nor renderer context supplies a user-data path', () => {
    const originalArguments = process.argv;
    const nativePath = stub(app, 'getPath').returns(undefined as never);
    process.argv = [];
    try {
      assert.throws(() => SchemaUpdater.updateToVersion1(), /Electron user-data path is unavailable/);
      assert.deepEqual(fs.readdirSync(directory), []);
    } finally {
      nativePath.restore();
      process.argv = originalArguments;
    }
  });
});
