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

import {getAccountDestination} from './AccountDestination';

describe('[characterization][CAP-001] account destination construction', () => {
  it('uses the selected default when the account has no saved endpoint', () => {
    assert.strictEqual(
      getAccountDestination({isAdding: true}, 'https://default.example.test/client?mode=desktop', 'de'),
      'https://default.example.test/client?mode=desktop&hl=de',
    );
  });

  it('preserves a saved custom endpoint, query and location while replacing locale', () => {
    assert.strictEqual(
      getAccountDestination(
        {isAdding: false, webappUrl: 'https://custom.example.test/client?hl=en&mode=desktop#/conversation/fixture'},
        'https://default.example.test',
        'fr',
      ),
      'https://custom.example.test/client?hl=fr&mode=desktop#/conversation/fixture',
    );
  });

  it('routes an unfinished SSO account to authentication on its chosen endpoint', () => {
    assert.strictEqual(
      getAccountDestination(
        {isAdding: true, webappUrl: 'https://custom.example.test/client?mode=desktop', ssoCode: 'fixture-code'},
        'https://default.example.test',
        'en',
      ),
      'https://custom.example.test/auth?mode=desktop&hl=en#sso/fixture-code',
    );
  });

  it('does not restart SSO for a completed account', () => {
    assert.strictEqual(
      getAccountDestination({isAdding: false, ssoCode: 'fixture-code'}, 'https://default.example.test/client', 'en'),
      'https://default.example.test/client?hl=en',
    );
  });

  it('rejects an invalid saved endpoint instead of silently falling back', () => {
    assert.throws(() =>
      getAccountDestination({isAdding: false, webappUrl: 'not a URL'}, 'https://default.example.test', 'en'),
    );
  });
});
