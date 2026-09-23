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

import {strict as assert} from 'node:assert';
import {createRequire} from 'node:module';
import path from 'node:path';

// Resolve from the updater: the build tools can have a different runtime version.
const rootRequire = createRequire(path.resolve('package.json'));
const updaterRequire = createRequire(rootRequire.resolve('electron-updater/package.json'));
const {HttpExecutor}: typeof import('builder-util-runtime') = updaterRequire('builder-util-runtime');
const {parseUpdateInfo, resolveFiles}: typeof import('electron-updater/out/providers/Provider') =
  updaterRequire('./out/providers/Provider');
const channelUrl = new URL('https://updates.invalid/latest-mac.yml');
const sha512 = Buffer.alloc(64, 1).toString('base64');
const raw = `version: 1.2.3\nfiles:\n  - url: WireInternal-1.2.3.zip\n    sha512: ${sha512}\n    size: 1234\nreleaseDate: '2026-09-22T00:00:00.000Z'\n`;

describe('[ELC-003][PKG-002] updater dependencies', () => {
  it('[characterization] parses release metadata and resolves the checksummed asset', () => {
    const info = parseUpdateInfo(raw, 'latest-mac.yml', channelUrl);
    assert.equal(info.version, '1.2.3');
    const files = resolveFiles(info, new URL('https://updates.invalid/channel/'));
    assert.equal(files.length, 1);
    assert.equal(files[0].url.href, 'https://updates.invalid/channel/WireInternal-1.2.3.zip');
    assert.equal(files[0].info.sha512, sha512);
    assert.equal(files[0].info.size, 1234);
  });
  it('[characterization] rejects malformed metadata and assets without checksums', () => {
    for (const data of ['files: [', '!!js/function function() {}']) {
      assert.throws(() => parseUpdateInfo(data, 'latest-mac.yml', channelUrl), {
        code: 'ERR_UPDATER_INVALID_UPDATE_INFO',
      });
    }
    const info = parseUpdateInfo('version: 1.2.3\nfiles: [{url: asset.zip}]', 'latest-mac.yml', channelUrl);
    assert.throws(() => resolveFiles(info, new URL(channelUrl)), {code: 'ERR_UPDATER_NO_CHECKSUM'});
  });
  it('[security-target] does not inherit attacker properties through YAML merge keys', () => {
    const info = parseUpdateInfo(
      'base: &base {__proto__: {poison: true}}\n<<: *base\nversion: 1.2.3',
      'latest-mac.yml',
      channelUrl,
    );
    assert.equal(Object.getPrototypeOf(info), Object.prototype);
    assert.equal('poison' in info, false);
  });
  it('[security-target] bounds repeated empty YAML merge sources', () => {
    const aliases = Array(100).fill('*empty').join(',');
    const mappings = Array.from({length: 101}, (_, index) => `m${index}: {<<: [${aliases}]}`).join('\n');
    const repeated = `empty: &empty {}\n${mappings}\nversion: 1.2.3`;
    assert.throws(() => parseUpdateInfo(repeated, 'latest-mac.yml', channelUrl), {
      code: 'ERR_UPDATER_INVALID_UPDATE_INFO',
    });
  });
  const sensitive = ['authorization', 'Authorization', 'PRIVATE-TOKEN', 'Cookie', 'Proxy-Authorization', 'X-Api-Key'];
  it('[characterization] retains credentials on a same-origin redirect', () => {
    const headers = Object.fromEntries(sensitive.map(name => [name, 'synthetic-token']));
    const next = HttpExecutor.prepareRedirectUrlOptions('https://updates.invalid/asset.zip', {
      protocol: 'https:',
      hostname: 'updates.invalid',
      path: '/feed',
      headers,
    });
    assert.deepEqual(next.headers, {...headers, 'User-Agent': 'electron-builder', 'Cache-Control': 'no-cache'});
    assert.equal(next.hostname, 'updates.invalid');
    assert.equal(next.path, '/asset.zip');
  });
  for (const destination of [
    'https://other.invalid/asset.zip',
    'http://updates.invalid/asset.zip',
    'https://updates.invalid:8443/asset.zip',
  ]) {
    for (const header of sensitive) {
      it(`[security-target] strips ${header} when redirecting to ${destination}`, () => {
        const next = HttpExecutor.prepareRedirectUrlOptions(destination, {
          protocol: 'https:',
          hostname: 'updates.invalid',
          path: '/feed',
          headers: {[header]: 'synthetic-token', Accept: 'application/octet-stream'},
        });
        assert.equal((next.headers as Record<string, unknown>)[header], undefined);
        assert.equal((next.headers as Record<string, unknown>).Accept, 'application/octet-stream');
      });
    }
  }
});
