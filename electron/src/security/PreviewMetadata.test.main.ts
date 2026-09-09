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

import {parse as parsePreviewMetadata} from 'open-graph';

import * as assert from 'assert';

describe('Preview metadata [SEC-012][DCP-015]', () => {
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
