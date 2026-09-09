/*
 * Wire
 * Copyright (C) 2019 Wire Swiss GmbH
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

import nock, {cleanAll} from 'nock';

import * as assert from 'assert';

import {getOpenGraphDataAsync as fetchOpenGraph} from './openGraph';

import {fetchPublicResource} from '../security/PublicResourceFetch';

const getOpenGraphDataAsync = (url: string) =>
  fetchOpenGraph(url, (value, limits) =>
    fetchPublicResource(value, limits, async () => [{address: '93.184.215.14', family: 4}]),
  );

const exampleUrl = 'https://example.com';
const defaultMessage = 'Hello from nock!';
const defaultMessageUtf8 = [72, 101, 108, 108, 111, 32, 102, 114, 111, 109, 32, 110, 111, 99, 107, 33];

const russianMessage = 'Привет из нока!';
const russianMessageKoi8r = [240, 210, 201, 215, 197, 212, 32, 201, 218, 32, 206, 207, 203, 193, 33];
// eslint-disable-next-line
const russianMessageUtf8 = [
  208, 159, 209, 128, 208, 184, 208, 178, 208, 181, 209, 130, 32, 208, 184, 208, 183, 32, 208, 189, 208, 190, 208, 186,
  208, 176, 33,
];

const contentLimitRequest = (contentType: string, contentArray: number[]) => {
  const html = Buffer.concat([
    Buffer.from('<head><meta property="og:description" content="'),
    Buffer.from(contentArray),
    Buffer.from('"></head>'),
  ]);
  nock(exampleUrl).get('/').reply(200, html, {
    'content-type': contentType,
  });
  return getOpenGraphDataAsync(exampleUrl).then(result => result.description);
};

describe('openGraph', () => {
  afterEach(() => cleanAll());

  it('[security-target][SEC-012] does not mutate inherited objects while parsing hostile metadata keys', async () => {
    const inherited = Object.prototype.toString as unknown as Record<string, unknown>;
    const previous = Object.getOwnPropertyDescriptor(inherited, 'wirePreviewProbe');
    nock(exampleUrl)
      .get('/hostile-keys')
      .reply(
        200,
        '<head><meta property="og:description" content="public text"><meta property="og:toString:wirePreviewProbe" content="polluted"></head>',
        {'content-type': 'text/html'},
      );
    try {
      const result = await getOpenGraphDataAsync(`${exampleUrl}/hostile-keys`);
      assert.strictEqual(result.description, 'public text');
      assert.deepStrictEqual(Object.getOwnPropertyDescriptor(inherited, 'wirePreviewProbe'), previous);
    } finally {
      if (previous) {
        Object.defineProperty(inherited, 'wirePreviewProbe', previous);
      } else {
        delete inherited.wirePreviewProbe;
      }
    }
  });

  it('[characterization][SEC-003][SEC-012] returns parsed metadata for the requested page', async () => {
    nock(exampleUrl)
      .get('/article')
      .reply(
        200,
        '<html><head><meta property="og:title" content="A title"><meta property="og:description" content="A description"></head></html>',
        {'content-type': 'text/html; charset=utf-8'},
      );

    const result = await getOpenGraphDataAsync(`${exampleUrl}/article`);

    assert.strictEqual(result.title, 'A title');
    assert.strictEqual(result.description, 'A description');
    assert.strictEqual(result.image, undefined);
  });

  it('decodes a text encoded with UTF-8', async () => {
    const result = await contentLimitRequest('text/html; charset=utf-8', defaultMessageUtf8);
    assert.strictEqual(result, defaultMessage);
  });

  it('[characterization][SEC-012] embeds an image without changing the page metadata', async () => {
    const pixels = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    nock(exampleUrl)
      .get('/image-page')
      .reply(
        200,
        '<head><meta property="og:description" content="Picture preview"><meta property="og:image" content="https://example.com/picture.png"></head>',
        {'content-type': 'text/html'},
      );
    nock(exampleUrl).get('/picture.png').reply(200, pixels, {'content-type': 'image/png'});

    const result = await getOpenGraphDataAsync(`${exampleUrl}/image-page`);
    assert.strictEqual(result.description, 'Picture preview');
    assert.ok(result.image && typeof result.image === 'object' && !Array.isArray(result.image));
    assert.strictEqual(result.image.data, `data:image/png;base64,${pixels.toString('base64')}`);
  });

  it('[characterization][SEC-012] retains text metadata when the preview image is unavailable', async () => {
    nock(exampleUrl)
      .get('/image-page')
      .reply(
        200,
        '<head><meta property="og:description" content="Picture preview"><meta property="og:image" content="https://example.com/missing.png"></head>',
        {'content-type': 'text/html'},
      );
    nock(exampleUrl).get('/missing.png').reply(404);

    const result = await getOpenGraphDataAsync(`${exampleUrl}/image-page`);
    assert.strictEqual(result.description, 'Picture preview');
    assert.strictEqual(result.image, undefined);
  });

  it('decodes a russian text encoded with koi8-r', async () => {
    const result = await contentLimitRequest('text/html; charset=koi8-r', russianMessageKoi8r);
    assert.strictEqual(result, russianMessage);
  });

  it('decodes a russian text encoded with UTF-8', async () => {
    const result = await contentLimitRequest('text/html; charset=utf-8', russianMessageUtf8);
    assert.strictEqual(result, russianMessage);
  });

  it('defaults to utf8 on invalid charsets', async () => {
    const result = await contentLimitRequest('text/html; charset=invalid', defaultMessageUtf8);
    assert.strictEqual(result, defaultMessage);
  });

  it('defaults to utf8 on missing charset', async () => {
    const result = await contentLimitRequest('text/html', defaultMessageUtf8);
    assert.strictEqual(result, defaultMessage);
  });

  it('throws on missing content type', async () => {
    try {
      await contentLimitRequest('', []);
      assert.fail(`Request didn't throw`);
    } catch (error: any) {
      assert.strictEqual(true, error.message.includes('Could not parse content type'));
    }
  });

  it('[security-target][SEC-012] does not replay response cookies across preview redirects', async () => {
    nock(exampleUrl).get('/cookies').reply(302, '', {location: '/landing', 'set-cookie': 'my-cookie=secret'});
    const cookies: unknown[] = [];
    const landing = nock(exampleUrl)
      .get('/landing')
      .reply(function () {
        cookies.push(this.req.headers.cookie);
        return [
          200,
          '<head><meta property="og:description" content="public preview"></head>',
          {'content-type': 'text/html'},
        ];
      });
    const result = await getOpenGraphDataAsync(`${exampleUrl}/cookies`);
    assert.strictEqual(result.description, 'public preview');
    assert.strictEqual(landing.isDone(), true);
    assert.deepStrictEqual(cookies, [undefined]);
  });

  for (const origin of ['http://127.0.0.1', 'http://169.254.169.254', 'http://10.0.0.1']) {
    it(`[security-target][SEC-012] refuses preview requests to ${origin}`, async () => {
      const target = nock(origin)
        .get('/private')
        .reply(200, '<head><meta property="og:description" content="private resource"></head>', {
          'content-type': 'text/html',
        });
      await assert.rejects(getOpenGraphDataAsync(`${origin}/private`), /not permitted/);
      assert.strictEqual(target.isDone(), false, 'denial must happen before any request');
    });
  }

  it('[security-target][SEC-012] refuses a public-page redirect into a private network', async () => {
    nock(exampleUrl).get('/redirect').twice().reply(302, '', {location: 'http://127.0.0.1/private'});
    const target = nock('http://127.0.0.1')
      .get('/private')
      .reply(200, '<head><meta property="og:description" content="private resource"></head>', {
        'content-type': 'text/html',
      });
    await assert.rejects(getOpenGraphDataAsync(`${exampleUrl}/redirect`), /not permitted/);
    assert.strictEqual(target.isDone(), false);
  });

  it('[security-target][SEC-012] keeps public text without fetching a private preview image', async () => {
    nock(exampleUrl)
      .get('/private-image')
      .reply(
        200,
        '<head><meta property="og:description" content="public text"><meta property="og:image" content="http://127.0.0.1/private.png"></head>',
        {'content-type': 'text/html'},
      );
    const target = nock('http://127.0.0.1')
      .get('/private.png')
      .reply(200, Buffer.from([1, 2]), {'content-type': 'image/png'});
    const result = await getOpenGraphDataAsync(`${exampleUrl}/private-image`);
    assert.strictEqual(result.description, 'public text');
    assert.strictEqual(result.image, undefined);
    assert.strictEqual(target.isDone(), false);
  });
});
