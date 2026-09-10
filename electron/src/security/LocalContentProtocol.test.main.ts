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

import {BrowserWindow, session} from 'electron';

import {strict as assert} from 'node:assert';
import {randomUUID} from 'node:crypto';
import path from 'node:path';

import {LOCAL_CONTENT_ORIGIN} from './LocalContentPolicy';
import {createLocalContentResponse, installLocalContentProtocol} from './LocalContentProtocol';

import {SECURE_SHELL_SCHEME} from '../secureShell/constants';

describe('[security-target][SEC-010] native local content protocol', () => {
  const directory = path.join(process.cwd(), 'electron');
  const url = (resource: string) => `${LOCAL_CONTENT_ORIGIN}/${resource}`;
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('serves real auxiliary assets with MIME/CSP headers and bodyless HEAD responses', async () => {
    const target = session.fromPartition(`local-content-${randomUUID()}`);
    dispose = installLocalContentProtocol(target, directory, 'about');
    const html = await target.fetch(url('html/about.html'));
    assert.equal(html.status, 200);
    assert.match(await html.text(), /id="logo"/);
    assert.equal(html.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(html.headers.get('content-security-policy')!, /script-src 'none'/);
    assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
    const css = await target.fetch(url('css/about.css'));
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type')!, /text\/css/);
    assert.match(await css.text(), /font-family/);
    const image = await target.fetch(url('img/logo.256.png'));
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const head = await target.fetch(url('css/about.css'), {method: 'HEAD'});
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });

  it('keeps shell CSP free of eval while preserving bundled scripts and styles', async () => {
    const response = await createLocalContentResponse(directory, 'shell', {
      url: url('renderer/index.html'),
      method: 'GET',
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /dist\/bundle.js/);
    const csp = response.headers.get('content-security-policy')!;
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self' 'unsafe-inline'/);
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /base-uri 'none'/);
    assert.match(csp, /form-action 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
  });

  it('loads a real local document and resolves its relative stylesheet through the handler', async () => {
    const target = session.fromPartition(`local-content-${randomUUID()}`);
    dispose = installLocalContentProtocol(target, directory, 'about');
    const window = new BrowserWindow({
      show: false,
      webPreferences: {session: target, contextIsolation: true, sandbox: true, nodeIntegration: false},
    });
    try {
      await window.loadURL(url('html/about.html'));
      const styles = await window.webContents.executeJavaScript(`Array.from(document.styleSheets, sheet => ({
        href: sheet.href, rules: sheet.cssRules.length
      }))`);
      assert.equal(styles.length, 1);
      assert.equal(styles[0].href, url('css/about.css'));
      assert.ok(styles[0].rules > 0);
    } finally {
      window.destroy();
    }
  });

  it('denies other roles, unknown assets and writes through the real session handler', async () => {
    const target = session.fromPartition(`local-content-${randomUUID()}`);
    dispose = installLocalContentProtocol(target, directory, 'proxy-prompt');
    for (const resource of [
      'html/about.html',
      'renderer/dist/bundle.js',
      'dist/preload/preload-shell.js',
      'package.json',
    ]) {
      const denied = await target.fetch(url(resource));
      assert.equal(denied.status, 404, resource);
      assert.equal(await denied.text(), 'Not found');
    }
    assert.equal((await target.fetch(url('html/proxy-prompt.html'), {method: 'POST', body: 'ignored'})).status, 404);
    const allowed = await target.fetch(url('html/proxy-prompt.html'));
    assert.equal(allowed.status, 200);
    assert.match(await allowed.text(), /id="passwordInput"/);
  });

  it('registers only on the intended session and removes its handler on disposal', async () => {
    const target = session.fromPartition(`local-content-${randomUUID()}`);
    const other = session.fromPartition(`local-content-other-${randomUUID()}`);
    dispose = installLocalContentProtocol(target, directory, 'about');
    assert.equal(await target.protocol.isProtocolHandled(SECURE_SHELL_SCHEME), true);
    assert.equal(await other.protocol.isProtocolHandled(SECURE_SHELL_SCHEME), false);
    await assert.rejects(other.fetch(url('html/about.html')));
    dispose();
    dispose = undefined;
    assert.equal(await target.protocol.isProtocolHandled(SECURE_SHELL_SCHEME), false);
    await assert.rejects(target.fetch(url('html/about.html')));
  });

  it('conceals filesystem errors and does not report a missing asset as successful HEAD', async () => {
    for (const method of ['GET', 'HEAD']) {
      const response = await createLocalContentResponse(path.join(directory, 'missing-sec010-fixture'), 'about', {
        url: url('html/about.html'),
        method,
      });
      assert.equal(response.status, 500);
      assert.equal(await response.text(), method === 'HEAD' ? '' : 'Local resource unavailable');
    }
  });
});
