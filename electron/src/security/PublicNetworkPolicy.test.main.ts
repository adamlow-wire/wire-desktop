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

import {isPublicNetworkAddress, resolvePublicTarget} from './PublicNetworkPolicy';

describe('public preview network policy [security-target][SEC-012]', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.1.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.9',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.0.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:8.8.8.8',
    '64:ff9b::7f00:1',
    '100::1',
    '2001::1',
    '2001:db8::1',
    '2002:7f00:1::1',
    '3fff::1',
    '5f00::1',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    'not-an-address',
  ]) {
    it(`rejects non-public or special-use address ${address}`, () => {
      assert.strictEqual(isPublicNetworkAddress(address), false);
    });
  }
  for (const address of ['8.8.8.8', '93.184.215.14', '2001:4860:4860::8888', '2606:4700:4700::1111']) {
    it(`permits native public unicast address ${address}`, () => {
      assert.strictEqual(isPublicNetworkAddress(address), true);
    });
  }
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com',
    'data:text/html,private',
    'https://user:password@example.com',
    'http://127.1',
    'http://2130706433',
    'http://0x7f000001',
    'http://0177.0.0.1',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'https://example.com:8443',
    ' https://example.com',
    'https://example.com\\@127.0.0.1',
  ]) {
    it(`rejects unsafe URL ${url}`, async () => {
      await assert.rejects(
        resolvePublicTarget(url, async () => [{address: '8.8.8.8', family: 4}]),
        /not permitted/,
      );
    });
  }
  it('validates every DNS answer, not only the first address', async () => {
    for (const answers of [
      [],
      [
        {address: '8.8.8.8', family: 4},
        {address: '127.0.0.1', family: 4},
      ],
      [{address: '8.8.8.8', family: 6}],
      [{address: 'invalid', family: 4}],
      Array.from({length: 33}, () => ({address: '8.8.8.8', family: 4})),
    ]) {
      await assert.rejects(
        resolvePublicTarget('https://example.com', async () => answers),
        /not permitted/,
      );
    }
  });
  it('preserves the HTTPS host while returning all validated socket addresses', async () => {
    const addresses = [
      {address: '8.8.8.8', family: 4},
      {address: '2606:4700:4700::1111', family: 6},
    ];
    const result = await resolvePublicTarget('https://example.com/article', async hostname => {
      assert.strictEqual(hostname, 'example.com');
      return addresses;
    });
    assert.strictEqual(result.url.href, 'https://example.com/article');
    assert.deepStrictEqual(result.addresses, addresses);
  });
  it('does not resolve numeric public addresses again', async () => {
    const result = await resolvePublicTarget('https://[2606:4700:4700::1111]', async () => {
      throw new Error('unexpected DNS');
    });
    assert.deepStrictEqual(result.addresses, [{address: '2606:4700:4700::1111', family: 6}]);
  });
});
