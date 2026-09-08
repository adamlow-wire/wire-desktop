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

import {parseDeepLink} from './deepLinkPolicy';

const id = '266d36c0-ae62-48b5-91b5-b10ed42f1a0f';

describe('deep-link policy [security-target][INV-005][SEC-013]', () => {
  it('preserves recognized location, SSO and join actions without exposing arbitrary event names', () => {
    for (const route of [
      `user/${id}`,
      `user/${id}/wire.test`,
      `user/wire.test/${id}`,
      `user/${id}@wire.test`,
      `conversation/${id}`,
      `conversation/${id}/wire.test`,
      `conversation/${id}/files`,
      `conversation/${id}/wire.test/files/folder/a%20b.pdf`,
      'preferences/about',
      'preferences/account',
      'preferences/av',
      'preferences/devices',
      'preferences/options',
      'meetings',
    ]) {
      assert.deepStrictEqual(parseDeepLink(`wire://${route}`), {kind: 'location', location: `/${route}`}, route);
    }
    assert.deepStrictEqual(parseDeepLink(`wire://start-sso/wire-${id}`), {kind: 'sso-login', code: `wire-${id}`});
    for (const suffix of ['', '/']) {
      assert.deepStrictEqual(parseDeepLink(`wire://start-login${suffix}`), {kind: 'start-login'});
      assert.deepStrictEqual(parseDeepLink(`wire://conversation-join${suffix}?code=code&key=key`), {
        kind: 'join-conversation',
        code: 'code',
        key: 'key',
        domain: null,
      });
    }
    for (const domain of ['WIRE.test', 'localhost']) {
      assert.deepStrictEqual(parseDeepLink(`wire://conversation-join?code=code&key=key&domain=${domain}`), {
        kind: 'join-conversation',
        code: 'code',
        key: 'key',
        domain: domain.toLowerCase(),
      });
    }
  });

  it('rejects malformed, oversized, encoded-delimiter and route-confusion inputs', () => {
    for (const value of [
      undefined,
      null,
      {},
      [],
      42,
      '',
      'not a URL',
      'wire://[invalid',
      'wire:start-login',
      'wire:/start-login',
      'https://start-login',
      'file:///secret',
      'javascript:alert(1)',
      'WIRE://start-login',
      ' wire://start-login',
      'wire://start-login\n',
      'wire://start-login\\',
      'wire://user@start-login',
      'wire://:password@start-login',
      'wire://start-login:80',
      'wire://start-login#fragment',
      'wire://start-login?extra=x',
      'wire://start-login/extra',
      'wire://unknown',
      'wire://preferences/admin',
      'wire://meetings/extra',
      'wire://access/?config=https://example.test/backend.json',
      `wire://user/${'a'.repeat(1024)}`,
      `wire://user/${id}//`,
      `wire://user/${id}/extra/path`,
      `wire://user//${id}`,
      `wire://user/${id}?extra=x`,
      `wire://user/no-id@wire.test`,
      `wire://user/%`,
      `wire://user/%2e%2e/${id}`,
      `wire://user/./${id}`,
      `wire://conversation/${id}//files`,
      `wire://conversation/${id}/wire.test/unknown`,
      `wire://conversation/not-id`,
      `wire://conversation/${id}?unexpected=x`,
      `wire://conversation/${id}/files/a%2Fb`,
      `wire://conversation/${id}/files/a%5Cb`,
      `wire://conversation/${id}/files/%00`,
      `wire://conversation/${id}/files/../a`,
      `wire://start-sso/wire-${id}/extra`,
      'wire://start-sso/bad',
      `wire://start-sso/wire-${id}?extra=x`,
      'wire://conversation-join/extra?code=c&key=k',
      'wire://conversation-join?code=c',
      'wire://conversation-join?key=k',
      'wire://conversation-join?code=&key=k',
      'wire://conversation-join?code=c&key=k&extra=x',
      'wire://conversation-join?code=c&code=d&key=k',
      'wire://conversation-join?code=c&key=k&%6bey=other',
      'wire://conversation-join?code=c%26key%3Dx&key=k',
      'wire://conversation-join?code=c&key=k&domain=',
      `wire://conversation-join?code=${'c'.repeat(129)}&key=k`,
    ]) {
      assert.strictEqual(parseDeepLink(value), undefined, String(value));
    }
  });

  it('matches backend domain constraints and rejects ambiguous qualified identities', () => {
    for (const domain of [
      'local',
      '.wire.test',
      'wire..test',
      '-wire.test',
      'wire-.test',
      'wire.test.',
      'wire.123',
      'wire_test.test',
      'wire.é',
      `${'a'.repeat(64)}.test`,
      `${'a.'.repeat(127)}test`,
    ]) {
      assert.strictEqual(parseDeepLink(`wire://user/${id}/${domain}`), undefined, domain);
      assert.strictEqual(parseDeepLink(`wire://conversation/${id}/${domain}`), undefined, domain);
      assert.strictEqual(
        parseDeepLink(`wire://conversation-join?code=c&key=k&domain=${encodeURIComponent(domain)}`),
        undefined,
        domain,
      );
    }
    assert.deepStrictEqual(parseDeepLink(`wire://user/WIRE.test/${id}`), {
      kind: 'location',
      location: `/user/wire.test/${id}`,
    });
    assert.deepStrictEqual(parseDeepLink(`wire://user/${id}/WIRE.test`), {
      kind: 'location',
      location: `/user/${id}/wire.test`,
    });
  });
});
