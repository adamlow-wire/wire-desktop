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

import {parsePreviewMetadata} from './PreviewMetadata';

describe('Preview metadata [SEC-012][DCP-015]', () => {
  it('[security-target] ignores arbitrary object paths without changing shared objects', () => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype.toString);
    const result = parsePreviewMetadata(`<meta property="og:toString:probe" content="polluted">
      <meta property="og:__proto__:probe" content="polluted">
      <meta property="og:constructor:prototype:probe" content="polluted">
      <meta property="og:image:constructor:probe" content="polluted">
      <meta property="ogx:description" content="wrong namespace">
      <meta property="og:description" content="safe">`);
    assert.deepStrictEqual(result, {title: '', description: 'safe'});
    assert.deepStrictEqual(Object.getOwnPropertyDescriptors(Object.prototype.toString), before);
  });

  for (const [label, html, error] of [
    ['HTML bytes', 'é'.repeat(500_001), /HTML is too large/],
    ['tag count', '<br>'.repeat(10_001), /too many tags/],
    ['metadata count', '<meta>'.repeat(129), /too many metadata/],
    ['scalar length', `<meta property="og:description" content="${'x'.repeat(8193)}">`, /field is too large/],
    ['image length', `<meta property="og:image" content="${'x'.repeat(8193)}">`, /field is too large/],
    ['fallback title length', `<title>${'x'.repeat(8193)}</title>`, /field is too large/],
    ['fallback image length', `<img src="${'x'.repeat(8193)}">`, /field is too large/],
  ] as const) {
    it(`[security-target] bounds ${label}`, () => assert.throws(() => parsePreviewMetadata(html), error));
  }

  it('[security-target] accepts the exact documented limits', () => {
    assert.deepStrictEqual(parsePreviewMetadata(' '.repeat(1_000_000)), {title: ''});
    assert.deepStrictEqual(parsePreviewMetadata('<br>'.repeat(10_000)), {title: ''});
    assert.deepStrictEqual(parsePreviewMetadata('<meta>'.repeat(128)), {title: ''});
    assert.strictEqual(
      parsePreviewMetadata(`<meta property="og:title" content="${'x'.repeat(8192)}">`).title.length,
      8192,
    );
  });

  it('[compatibility] skips missing content and unrelated metadata, and prefers Open Graph images', () => {
    assert.deepStrictEqual(
      parsePreviewMetadata(`<meta name="description" content="not Open Graph">
      <meta property="og:title"><img src="fallback.png">
      <meta property="og:image:secure_url" content="https://example.com/image.png">
      <meta property="og:image:alt" content="Picture">`),
      {
        title: '',
        image: {secure_url: 'https://example.com/image.png', alt: 'Picture'},
      },
    );
  });

  it('[characterization] preserves entities, repeated fields and image metadata', () => {
    const result = parsePreviewMetadata(`<html><head>
      <title>Fallback</title>
      <meta property="og:title" content="Fish &amp; Chips">
      <meta property="og:description" content="first"><meta property="og:description" content="second">
      <meta property="og:site_name" content="Publisher"><meta property="og:type" content="article">
      <meta property="og:url" content="https://example.com/article">
      <meta property="og:image" content="/first.png"><meta property="og:image:width" content="120">
      <meta property="og:image" content="/second.png">
      </head></html>`);
    assert.deepStrictEqual(result, {
      title: 'Fish & Chips',
      description: ['first', 'second'],
      site_name: 'Publisher',
      type: 'article',
      url: 'https://example.com/article',
      image: {url: ['/first.png', '/second.png'], width: '120'},
    });
  });

  it('[characterization] falls back to title text and the first image', () => {
    assert.deepStrictEqual(
      parsePreviewMetadata(
        '<TITLE>Fallback &amp; title</TITLE><img src="/one.png" width="40" height="30"><img src="/two.png">',
      ),
      {
        title: 'Fallback & title',
        image: {url: '/one.png', width: '40', height: '30'},
      },
    );
  });

  it('[characterization] honors an explicit Open Graph namespace', () => {
    assert.deepStrictEqual(
      parsePreviewMetadata(
        '<html xmlns:preview="http://opengraphprotocol.org/schema/"><meta property="preview:title" content="Namespaced"></html>',
      ),
      {title: 'Namespaced'},
    );
  });
});
