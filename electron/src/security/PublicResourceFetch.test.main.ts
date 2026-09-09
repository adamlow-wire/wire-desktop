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

import nock from 'nock';

import * as assert from 'assert';
import {LookupAddress} from 'dns';
import {EventEmitter} from 'events';
import {ClientRequest, IncomingMessage} from 'http';
import {Readable} from 'stream';
import {brotliCompressSync, deflateSync, gzipSync} from 'zlib';

import {fetchPublicResource} from './PublicResourceFetch';

const origin = 'https://example.com';
const publicDns = async () => [{address: '93.184.215.14', family: 4}];
const limits = {maxBytes: 64, userAgent: 'preview-fixture', timeoutMs: 1000};
const fetch = (path: string, overrides = {}) =>
  fetchPublicResource(origin + path, {...limits, ...overrides}, publicDns);

describe('public preview fetch [security-target][SEC-012]', function () {
  this.timeout(5000);
  beforeEach(() => nock.disableNetConnect());
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('pins validated DNS addresses into the actual request options without changing HTTPS identity', async () => {
    let resolutions = 0;
    const result = await fetchPublicResource(
      `${origin}/page`,
      limits,
      async () => {
        resolutions++;
        return resolutions === 1 ? await publicDns() : [{address: '127.0.0.1', family: 4}];
      },
      (url, options, receive) => {
        assert.strictEqual(url.href, `${origin}/page`);
        assert.strictEqual(options.agent, false);
        assert.strictEqual(options.family, 4);
        assert.deepStrictEqual(options.headers, {
          'User-Agent': 'preview-fixture',
          'Accept-Encoding': 'gzip, deflate, br',
        });
        assert.ok(options.lookup);
        options.lookup('example.com', {}, (error, address, family) => {
          assert.strictEqual(error, null);
          assert.strictEqual(address, '93.184.215.14');
          assert.strictEqual(family, 4);
        });
        options.lookup('example.com', {all: true}, (error, addresses) => {
          assert.strictEqual(error, null);
          assert.deepStrictEqual(addresses, [{address: '93.184.215.14', family: 4}]);
        });
        const request = new EventEmitter() as ClientRequest;
        request.end = (() => {
          const response = Readable.from([Buffer.from('preview')]) as IncomingMessage;
          response.headers = {};
          response.statusCode = 200;
          receive(response);
          return request;
        }) as ClientRequest['end'];
        return request;
      },
    );
    assert.strictEqual(result.body.toString(), 'preview');
    assert.strictEqual(resolutions, 1);
  });

  for (const [encoding, compress] of [
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const) {
    it(`bounds and decodes ${encoding} responses`, async () => {
      nock(origin)
        .get('/compressed')
        .reply(200, compress(Buffer.from('preview')), {'content-encoding': encoding});
      assert.strictEqual((await fetch('/compressed')).body.toString(), 'preview');
    });
    it(`rejects ${encoding} expansion beyond the decoded byte limit`, async () => {
      const encoded = compress(Buffer.alloc(1024, 65));
      assert.ok(encoded.length < limits.maxBytes);
      nock(origin).get('/bomb').reply(200, encoded, {'content-encoding': encoding});
      await assert.rejects(fetch('/bomb'), /too large/);
    });
  }

  it('rejects oversized uncompressed responses', async () => {
    nock(origin).get('/large').reply(200, Buffer.alloc(65));
    await assert.rejects(fetch('/large'), /too large/);
  });
  it('bounds compressed wire bytes even when the decoded body would fit', async () => {
    const encoded = gzipSync(Buffer.from(Array.from({length: 60}, (_, index) => index)));
    assert.ok(encoded.length > limits.maxBytes);
    nock(origin).get('/wire-limit').reply(200, encoded, {'content-encoding': 'gzip'});
    await assert.rejects(fetch('/wire-limit'), /too large/);
  });
  it('rejects malformed compressed content', async () => {
    nock(origin).get('/broken-gzip').reply(200, 'not gzip', {'content-encoding': 'gzip'});
    await assert.rejects(fetch('/broken-gzip'));
  });
  it('propagates a connection failure without retrying', async () => {
    const scope = nock(origin).get('/broken').replyWithError('fixture connection closed');
    await assert.rejects(fetch('/broken'), /fixture connection closed/);
    assert.strictEqual(scope.isDone(), true);
  });
  it('accepts an empty successful response with identity encoding', async () => {
    nock(origin).get('/empty').reply(204, '', {'content-encoding': 'identity'});
    assert.strictEqual((await fetch('/empty')).body.length, 0);
  });
  it('rejects unsupported encodings', async () => {
    nock(origin).get('/encoding').reply(200, 'preview', {'content-encoding': 'unknown'});
    await assert.rejects(fetch('/encoding'), /Unsupported/);
  });
  it('rejects unsuccessful status without repeating the request', async () => {
    const scope = nock(origin).get('/missing').reply(404);
    await assert.rejects(fetch('/missing'), /unsuccessful/);
    assert.strictEqual(scope.isDone(), true);
  });
  it('follows a relative redirect with freshly validated DNS', async () => {
    let resolutions = 0;
    nock(origin).get('/start').reply(302, '', {location: '/end'});
    nock(origin).get('/end').reply(200, 'preview');
    const result = await fetchPublicResource(`${origin}/start`, limits, async () => {
      resolutions++;
      return publicDns();
    });
    assert.strictEqual(result.url.href, `${origin}/end`);
    assert.strictEqual(result.body.toString(), 'preview');
    assert.strictEqual(resolutions, 2);
  });
  it('rejects DNS rebinding on a redirect before sending the second request', async () => {
    let resolutions = 0;
    nock(origin).get('/start').reply(302, '', {location: '/end'});
    const blocked = nock(origin).get('/end').reply(200, 'private');
    await assert.rejects(
      fetchPublicResource(`${origin}/start`, limits, async () => {
        return ++resolutions === 1 ? publicDns() : [{address: '127.0.0.1', family: 4}];
      }),
      /not permitted/,
    );
    assert.strictEqual(blocked.isDone(), false);
  });
  for (const location of [
    'http://example.com/end',
    'https://127.0.0.1/private',
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'https://example.com:8443',
  ]) {
    it(`rejects redirect ${location}`, async () => {
      nock(origin).get('/redirect').reply(302, '', {location});
      await assert.rejects(fetch('/redirect'), /not permitted/);
    });
  }
  it('rejects a redirect with no location', async () => {
    nock(origin).get('/redirect').reply(302);
    await assert.rejects(fetch('/redirect'), /not permitted/);
  });
  it('stops after five redirects', async () => {
    const scope = nock(origin).get('/loop').times(6).reply(302, '', {location: '/loop'});
    await assert.rejects(fetch('/loop'), /not permitted/);
    assert.strictEqual(scope.isDone(), true);
  });
  for (const phase of ['connection', 'body']) {
    it(`enforces the total deadline during ${phase}`, async () => {
      const scope = nock(origin).get('/slow');
      (phase === 'connection' ? scope.delayConnection(200) : scope.delayBody(200)).reply(200, 'preview');
      await assert.rejects(fetch('/slow', {timeoutMs: 20}), /timed out/);
    });
  }
  it('does not start a request when DNS completes after the deadline', async () => {
    let release!: (addresses: LookupAddress[]) => void;
    const blocked = nock(origin).get('/late').reply(200, 'preview');
    await assert.rejects(
      fetchPublicResource(
        `${origin}/late`,
        {...limits, timeoutMs: 20},
        () =>
          new Promise(resolve => {
            release = resolve;
          }),
      ),
      /timed out/,
    );
    release(await publicDns());
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.strictEqual(blocked.isDone(), false);
  });
});
