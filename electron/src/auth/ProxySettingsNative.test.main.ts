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

import {app, session} from 'electron';

import {strict as assert} from 'assert';
import {randomUUID} from 'crypto';

import {loadProxySettingsApplication} from '../../test/proxySettingsApplicationFixture';

const cases = [
  ['http://proxy.example.test:1080', 'PROXY proxy.example.test:1080'],
  ['https://proxy.example.test:1080', 'HTTPS proxy.example.test:1080'],
  ['https://proxy.example.test', 'HTTPS proxy.example.test:443'],
  ['socks4://proxy.example.test:1080', 'SOCKS proxy.example.test:1080'],
  ['socks5://proxy.example.test:1080', 'SOCKS5 proxy.example.test:1080'],
  ['socks4://proxy.example.test', 'SOCKS proxy.example.test:1080'],
  ['socks5://[::1]:1080', 'SOCKS5 [::1]:1080'],
] as const;

describe('[CAP-005] native Chromium proxy resolution', () => {
  before(async () => {
    await app.whenReady();
  });

  for (const [endpoint, expected] of cases) {
    it(`resolves HTTP and HTTPS through ${endpoint}`, async () => {
      const target = session.fromPartition(`cap005-proxy-resolution-${randomUUID()}`);
      const logs: unknown[][] = [];
      const proxy = new URL(endpoint);
      proxy.username = 'fixture-user';
      proxy.password = 'fixture-password';
      proxy.search = '?private=fixture-query';
      try {
        await loadProxySettingsApplication(logs)(proxy, {session: target});
        for (const scheme of ['http', 'https']) {
          // Resolves fixed rules only; no page, proxy connection or credential exchange.
          assert.equal(await target.resolveProxy(`${scheme}://destination.example.test/path`), expected);
        }
        assert.equal(logs.length, 1);
        assert.doesNotMatch(JSON.stringify(logs), /fixture-user|fixture-password|fixture-query/);
      } finally {
        await target.setProxy({mode: 'direct'});
      }
    });
  }
});
