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

import {createApplicationShellBootstrap} from './ApplicationShellBootstrap';

import {LANGUAGES} from '../locale/languages';

describe('application shell bootstrap', () => {
  it('[compatibility][SEC-006] preserves main-selected language and platform without filesystem access', () => {
    assert.deepStrictEqual(createApplicationShellBootstrap('de-DE', 'darwin'), {
      isMac: true,
      locale: 'de',
      locStrings: LANGUAGES.de,
      locStringsDefault: LANGUAGES.en,
    });
    assert.deepStrictEqual(createApplicationShellBootstrap('fr', 'win32'), {
      isMac: false,
      locale: 'fr',
      locStrings: LANGUAGES.fr,
      locStringsDefault: LANGUAGES.en,
    });
  });

  it('[compatibility][SEC-006] uses English for absent and unsupported bootstrap locales', () => {
    for (const locale of [undefined, '', 'xx', '__proto__']) {
      assert.deepStrictEqual(createApplicationShellBootstrap(locale, 'linux'), {
        isMac: false,
        locale: 'en',
        locStrings: LANGUAGES.en,
        locStringsDefault: LANGUAGES.en,
      });
    }
  });
});
