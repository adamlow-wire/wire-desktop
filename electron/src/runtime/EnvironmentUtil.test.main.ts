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

import {stub} from 'sinon';

import assert from 'node:assert';

import {
  getAvailableEnvironments,
  reportWindowsMsiConfigurationIssue,
  resolveWebappUrl,
  ServerType,
  setEnvironment,
} from './EnvironmentUtil';

import {settings} from '../settings/ConfigurationPersistence';
import {SettingsType} from '../settings/SettingsType';

describe('EnvironmentUtil managed webapp configuration', () => {
  it('reports configured failures without logging or using the rejected value', () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const issueLogger = {
      error: (message: string) => errors.push(message),
      warn: (message: string) => warnings.push(message),
    };

    reportWindowsMsiConfigurationIssue({isConfigured: true, issue: 'invalid-url'}, issueLogger);

    assert.deepStrictEqual(errors, [
      'MSI webapp configuration issue: invalid-url; refusing to fall back to an unmanaged endpoint.',
    ]);
    assert.deepStrictEqual(warnings, []);
    assert.strictEqual(
      resolveWebappUrl(
        {isConfigured: true, issue: 'invalid-url'},
        undefined,
        false,
        'https://environment.example.test',
        'https://default.example.test',
      ),
      undefined,
    );
  });

  it('reports unreadable machine policy as an error and preserves normal precedence only when absent', () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const issueLogger = {
      error: (message: string) => errors.push(message),
      warn: (message: string) => warnings.push(message),
    };

    reportWindowsMsiConfigurationIssue({isConfigured: true, issue: 'registry-unavailable'}, issueLogger);
    reportWindowsMsiConfigurationIssue({isConfigured: false}, issueLogger);

    assert.deepStrictEqual(errors, [
      'MSI webapp configuration issue: registry-unavailable; refusing to fall back to an unmanaged endpoint.',
    ]);
    assert.deepStrictEqual(warnings, []);
    assert.strictEqual(
      resolveWebappUrl(
        {isConfigured: false},
        'https://configured.example.test',
        false,
        'https://environment.example.test',
        'https://default.example.test',
      ),
      'https://configured.example.test',
    );
    assert.strictEqual(
      resolveWebappUrl(
        {isConfigured: false},
        undefined,
        false,
        'https://environment.example.test',
        'https://default.example.test',
      ),
      'https://environment.example.test',
    );
    assert.strictEqual(
      resolveWebappUrl({isConfigured: false}, undefined, false, undefined, 'https://default.example.test'),
      'https://default.example.test',
    );
  });

  it('requires an explicit configured URL for Wire Gov', () => {
    assert.strictEqual(
      resolveWebappUrl(
        {isConfigured: false},
        'https://wire-gov.example.test',
        true,
        'https://environment.example.test',
        'https://default.example.test',
      ),
      'https://wire-gov.example.test',
    );
    assert.strictEqual(
      resolveWebappUrl(
        {isConfigured: false},
        undefined,
        true,
        'https://environment.example.test',
        'https://default.example.test',
      ),
      undefined,
    );
  });
});

describe('[PKG-003] environment settings persistence failure', () => {
  for (const previous of [undefined, ServerType.PRODUCTION]) {
    it(`preserves active selection and restores the previous setting (${previous})`, () => {
      const original = global._ConfigurationPersistence;
      global._ConfigurationPersistence = previous === undefined ? {} : {[SettingsType.ENV]: previous};
      const activeBefore = getAvailableEnvironments();
      const persist = stub(settings, 'persistToFile').throws(new Error('synthetic disk failure'));
      try {
        assert.throws(() => setEnvironment(ServerType.BETA), /Environment settings could not be saved/);
        assert.deepStrictEqual(getAvailableEnvironments(), activeBefore);
        assert.deepStrictEqual(
          global._ConfigurationPersistence,
          previous === undefined ? {} : {[SettingsType.ENV]: previous},
        );
        assert.strictEqual(persist.callCount, 1);
      } finally {
        persist.restore();
        global._ConfigurationPersistence = original;
      }
    });
  }
});
