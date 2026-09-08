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

import {
  isAllowedAccountNavigation,
  isAllowedSsoNavigation,
  parseNetworkNavigation,
  selectAccountPopup,
} from './NavigationPolicy';

describe('navigation policy [security-target][INV-005][INV-010][SEC-008]', () => {
  const origin = 'https://app.wire.test';
  it('allows exact account origins and rejects protocol/host/credential confusion', () => {
    for (const url of [`${origin}/conversation?id=1#message`, `${origin}:443/auth`]) {
      assert.strictEqual(isAllowedAccountNavigation(url, origin), true, url);
    }
    for (const url of [
      '',
      'not a URL',
      'not-a-url',
      `http://app.wire.test`,
      `${origin}:444`,
      `${origin}.evil.test`,
      `${origin}@evil.test`,
      'https://user:pass@app.wire.test',
      'https://user@app.wire.test',
      'https://:password@app.wire.test',
      'https:app.wire.test',
      'https:/app.wire.test',
      `blob:${origin}/id`,
      'data:text/html,bad',
      'file:///tmp/app',
      'javascript:alert(1)',
      `${origin}/a\nb`,
      ` ${origin}`,
      'https:\\app.wire.test',
      `${origin}/${'a'.repeat(8192)}`,
    ]) {
      assert.strictEqual(isAllowedAccountNavigation(url, origin), false, url);
    }
    assert.strictEqual(isAllowedAccountNavigation(origin, undefined), false);
    assert.strictEqual(isAllowedAccountNavigation('data:text/html,x', 'null'), false);
    assert.strictEqual(parseNetworkNavigation('https://[invalid'), undefined);
  });

  it('restricts SSO redirects and callback transport without hardcoding enterprise IdP hosts', () => {
    const allowed = (url: string) => isAllowedSsoNavigation(url, 'http://127.0.0.1:1234', 'wire-sso');
    for (const url of [
      'https://enterprise-idp.test/login',
      'http://127.0.0.1:1234/login',
      'wire-sso://response?type=AUTH_SUCCESS',
      'wire-sso://response/?type=AUTH_SUCCESS',
    ]) {
      assert.strictEqual(allowed(url), true, url);
    }
    for (const url of [
      '',
      'not a URL',
      'http://127.0.0.1:4321/login',
      'http://enterprise-idp.test',
      'https:enterprise-idp.test',
      'file:///tmp/secret',
      'wire-sso://wrong-host',
      'wire-sso://[invalid',
      'wire-sso://response/path',
      'wire-sso://response:80',
      'wire-sso://user@response',
      'wire-sso://:password@response',
      'wire-sso://response#fragment',
      'wire-sso://response?value=a\nb',
      `wire-sso://response?${'a'.repeat(255)}`,
    ]) {
      assert.strictEqual(allowed(url), false, url);
    }
  });

  it('allows required SSO/PiP flows only from the account origin', () => {
    const decide = (url: string, frameName: string, referrerUrl = origin, accountOrigin: string | undefined = origin) =>
      selectAccountPopup({url, frameName, referrerUrl, accountOrigin, sourceUrl: origin});
    assert.strictEqual(decide('https://backend.wire.test/sso/initiate-login/code', 'WIRE_SSO'), 'sso');
    assert.strictEqual(decide('http://backend.wire.test/sso', 'WIRE_SSO'), 'deny');
    assert.strictEqual(decide('data:text/html,x', 'WIRE_SSO'), 'deny');
    assert.strictEqual(decide('about:blank', 'WIRE_PICTURE_IN_PICTURE_CALL'), 'picture-in-picture');
    assert.strictEqual(decide('', 'WIRE_PICTURE_IN_PICTURE_CALL'), 'picture-in-picture');
    assert.strictEqual(decide(`${origin}/call`, 'WIRE_PICTURE_IN_PICTURE_CALL'), 'picture-in-picture');
    assert.strictEqual(decide('https://evil.test/call', 'WIRE_PICTURE_IN_PICTURE_CALL'), 'deny');
    assert.strictEqual(decide('https://example.test', '_blank'), 'external');
    assert.strictEqual(decide('mailto:person@example.test', '_blank'), 'external');
    assert.strictEqual(decide('ftp://example.test/file', '_blank'), 'external');
    assert.strictEqual(decide('file:///tmp/x', '_blank'), 'deny');
    assert.strictEqual(decide('https://backend.wire.test/sso', 'WIRE_SSO', 'https://embedded.evil.test'), 'deny');
    assert.strictEqual(decide('about:blank', 'WIRE_PICTURE_IN_PICTURE_CALL', ''), 'deny');
    assert.strictEqual(
      selectAccountPopup({
        url: origin,
        frameName: '_blank',
        referrerUrl: origin,
        accountOrigin: undefined,
        sourceUrl: origin,
      }),
      'deny',
    );
    assert.strictEqual(
      selectAccountPopup({
        url: 'http://127.0.0.1/sso',
        frameName: 'WIRE_SSO',
        referrerUrl: 'http://127.0.0.1',
        accountOrigin: 'http://127.0.0.1',
        sourceUrl: 'http://127.0.0.1',
      }),
      'sso',
    );
  });

  it('authorizes noreferrer external links using the main-owned source URL, never a claimed referrer alone', () => {
    const request = {
      url: 'https://example.test/',
      frameName: '_blank',
      referrerUrl: '',
      accountOrigin: origin,
      sourceUrl: origin,
    };
    assert.strictEqual(selectAccountPopup(request), 'external');
    for (const sourceUrl of ['', 'about:blank', 'https://foreign.test', `${origin}.evil.test`]) {
      for (const referrerUrl of ['', origin]) {
        assert.strictEqual(selectAccountPopup({...request, sourceUrl, referrerUrl}), 'deny');
      }
    }
    assert.strictEqual(selectAccountPopup({...request, referrerUrl: 'https://foreign.test'}), 'deny');
    assert.strictEqual(selectAccountPopup({...request, frameName: 'WIRE_SSO'}), 'deny');
    assert.strictEqual(
      selectAccountPopup({...request, url: 'about:blank', frameName: 'WIRE_PICTURE_IN_PICTURE_CALL'}),
      'deny',
    );
    assert.strictEqual(selectAccountPopup({...request, url: 'javascript:alert(1)'}), 'deny');
    assert.strictEqual(selectAccountPopup({...request, url: 'wire://start-login'}), 'deep-link');
    assert.strictEqual(selectAccountPopup({...request, url: 'wire://unknown'}), 'deny');
    assert.strictEqual(
      selectAccountPopup({...request, url: 'wire://start-login', sourceUrl: 'https://foreign.test'}),
      'deny',
    );
    assert.strictEqual(selectAccountPopup({...request, url: 'wire://start-login', frameName: 'WIRE_SSO'}), 'deny');
  });
});
