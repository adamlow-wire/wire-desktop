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

import assert from 'node:assert';

import {reportWindowsMsiConfigurationIssue, resolveWebappUrl} from './EnvironmentUtil';

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

  it('warns for unavailable optional configuration and preserves normal URL precedence', () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const issueLogger = {
      error: (message: string) => errors.push(message),
      warn: (message: string) => warnings.push(message),
    };

    reportWindowsMsiConfigurationIssue({isConfigured: false, issue: 'registry-unavailable'}, issueLogger);
    reportWindowsMsiConfigurationIssue({isConfigured: false}, issueLogger);

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(warnings, [
      'MSI webapp configuration issue: registry-unavailable; continuing without machine-wide configuration.',
    ]);
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
