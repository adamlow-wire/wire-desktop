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

import {LOCAL_CONTENT_ORIGIN, LocalContentRole, resolveLocalContentResource} from './LocalContentPolicy';

describe('[security-target][SEC-010] local content resource policy', () => {
  const fixtures: [LocalContentRole, string, string][] = [
    ['display-broker', 'html/display-capture.html', 'text/html; charset=utf-8'],
    ['display-broker', 'css/display-capture.css', 'text/css; charset=utf-8'],
    ['permission-consent', 'html/account-permission.html', 'text/html; charset=utf-8'],
    ['permission-consent', 'css/account-permission.css', 'text/css; charset=utf-8'],
    ['shell', 'renderer/index.html', 'text/html; charset=utf-8'],
    ['shell', 'renderer/dist/bundle.js', 'text/javascript; charset=utf-8'],
    ['about', 'html/about.html', 'text/html; charset=utf-8'],
    ['about', 'css/about.css', 'text/css; charset=utf-8'],
    ['about', 'img/logo.256.png', 'image/png'],
    ['proxy-prompt', 'html/proxy-prompt.html', 'text/html; charset=utf-8'],
    ['proxy-prompt', 'css/proxy-prompt.css', 'text/css; charset=utf-8'],
  ];

  for (const [role, path, contentType] of fixtures) {
    it(`serves only the fixed ${role} asset ${path}`, () => {
      for (const method of ['GET', 'HEAD']) {
        assert.deepEqual(resolveLocalContentResource(role, `${LOCAL_CONTENT_ORIGIN}/${path}`, method), {
          path,
          contentType,
        });
      }
      for (const other of ['shell', 'about', 'proxy-prompt', 'display-broker', 'permission-consent'] as const) {
        if (other !== role) {
          assert.equal(resolveLocalContentResource(other, `${LOCAL_CONTENT_ORIGIN}/${path}`, 'GET'), undefined);
        }
      }
    });
  }

  it('retains main-owned shell startup query parameters without treating them as file paths', () => {
    assert.deepEqual(
      resolveLocalContentResource(
        'shell',
        `${LOCAL_CONTENT_ORIGIN}/renderer/index.html?focus=true&env=https%253A%252F%252Fexample.test`,
        'GET',
      ),
      {path: 'renderer/index.html', contentType: 'text/html; charset=utf-8'},
    );
  });

  it('rejects unknown, malformed, ambiguous and non-local resource URLs', () => {
    for (const url of [
      '',
      'not a URL',
      'file:///etc/passwd',
      'https://shell/renderer/index.html',
      'wire-app://other/renderer/index.html',
      'wire-app://shell:123/renderer/index.html',
      'wire-app://user:password@shell/renderer/index.html',
      `${LOCAL_CONTENT_ORIGIN}/`,
      `${LOCAL_CONTENT_ORIGIN}/package.json`,
      `${LOCAL_CONTENT_ORIGIN}/dist/preload/preload-shell.js`,
      `${LOCAL_CONTENT_ORIGIN}/renderer/../renderer/index.html`,
      `${LOCAL_CONTENT_ORIGIN}/%72enderer/index.html`,
      `${LOCAL_CONTENT_ORIGIN}/renderer/%2e%2e/renderer/index.html`,
      `${LOCAL_CONTENT_ORIGIN}/renderer%2findex.html`,
      `${LOCAL_CONTENT_ORIGIN}/renderer\\index.html`,
      `${LOCAL_CONTENT_ORIGIN}/renderer/index.html#fragment`,
      `${LOCAL_CONTENT_ORIGIN}/renderer/dist/bundle.js?extra=true`,
      `${LOCAL_CONTENT_ORIGIN}/renderer/index.html?${'x'.repeat(8192)}`,
      ` ${LOCAL_CONTENT_ORIGIN}/renderer/index.html`,
      `${LOCAL_CONTENT_ORIGIN}/renderer/index.html\n`,
    ]) {
      assert.equal(resolveLocalContentResource('shell', url, 'GET'), undefined, url);
    }
  });

  it('rejects non-read methods and unknown window roles', () => {
    const url = `${LOCAL_CONTENT_ORIGIN}/renderer/index.html`;
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'get', '']) {
      assert.equal(resolveLocalContentResource('shell', url, method), undefined);
    }
    assert.equal(resolveLocalContentResource('account' as LocalContentRole, url, 'GET'), undefined);
  });
});
