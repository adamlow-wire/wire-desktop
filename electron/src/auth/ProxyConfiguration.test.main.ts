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

import * as ts from 'typescript';

import {strict as assert} from 'assert';
import {readFileSync} from 'fs';
import * as path from 'path';
import {runInNewContext} from 'vm';

function configure(cli?: string, file?: string) {
  const filename = path.resolve('electron/src/mainProcess.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const blocks = source.statements.filter(
    node =>
      ts.isIfStatement(node) &&
      node.expression.getText(source) === 'argv[config.ARGUMENT.PROXY_SERVER] || fileBasedProxyConfig',
  );
  assert.equal(blocks.length, 1);
  const logs: unknown[][] = [];
  const switches: string[][] = [];
  const compiled = ts.transpileModule(`let proxyInfoArg; ${blocks[0].getText(source)}; proxyInfoArg;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  const proxy = runInNewContext(compiled, {
    URL,
    argv: {proxy: cli},
    config: {ARGUMENT: {PROXY_SERVER: 'proxy'}},
    fileBasedProxyConfig: file,
    app: {commandLine: {appendSwitch: (...args: string[]) => switches.push(args)}},
    logger: {info: (...args: unknown[]) => logs.push(args), error: (...args: unknown[]) => logs.push(args)},
  }) as URL | undefined;
  return {proxy, logs, switches};
}

describe('[CAP-005] production startup proxy configuration', () => {
  for (const origin of ['cli', 'file']) {
    for (const protocol of ['http', 'https', 'socks4', 'socks5']) {
      it(`retains valid ${protocol} from ${origin}`, () => {
        const value = `${protocol}://fixture-user:fixture-password@proxy.example.test:1080`;
        const result = configure(origin === 'cli' ? value : undefined, origin === 'file' ? value : undefined);
        assert.equal(result.proxy?.href, new URL(value).href);
        assert.deepEqual(result.switches, origin === 'file' ? [['proxy-server', value]] : []);
        assert.doesNotMatch(JSON.stringify(result.logs), /fixture-user|fixture-password/);
      });
    }
    for (const value of [
      'ftp://fixture-user:fixture-password@proxy.example.test',
      'socks5:fixture-password',
      'not a URL',
    ]) {
      it(`rejects invalid ${value.split(':')[0]} from ${origin} before native configuration`, () => {
        const result = configure(origin === 'cli' ? value : undefined, origin === 'file' ? value : undefined);
        assert.equal(result.proxy, undefined);
        assert.deepEqual(result.switches, []);
        assert.deepEqual(result.logs, [['Could not parse authenticated proxy URL.']]);
      });
    }
  }

  it('prefers CLI configuration over the file without adding another switch', () => {
    const result = configure('https://cli.example.test', 'http://file.example.test');
    assert.equal(result.proxy?.hostname, 'cli.example.test');
    assert.deepEqual(result.switches, []);
  });

  it('does nothing when no proxy is configured', () => {
    const result = configure();
    assert.equal(result.proxy, undefined);
    assert.deepEqual(result.logs, []);
    assert.deepEqual(result.switches, []);
  });
});
