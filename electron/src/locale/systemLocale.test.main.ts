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

import * as assert from 'assert';

import {resolveSystemLocale} from './systemLocale';

describe('system locale resolution', () => {
  it('uses the first available locale across main, renderer, and platform sources', () => {
    assert.strictEqual(resolveSystemLocale('de-DE', 'fr-FR', 'en-GB'), 'de-DE');
    assert.strictEqual(resolveSystemLocale(undefined, 'fr-FR', 'en-GB'), 'fr-FR');
    assert.strictEqual(resolveSystemLocale(undefined, undefined, 'en-GB'), 'en-GB');
  });

  it('keeps startup deterministic when Electron has not exposed a locale yet', () => {
    assert.strictEqual(resolveSystemLocale(undefined, undefined, undefined), 'en');
    assert.strictEqual(resolveSystemLocale('', null, '  '), 'en');
  });
});
