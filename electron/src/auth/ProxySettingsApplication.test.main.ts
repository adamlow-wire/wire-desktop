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

function loadApplication(logs: unknown[][]): (proxy: URL, contents: unknown) => Promise<void> {
  const filename = path.resolve('electron/src/mainProcess.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const initializers: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'applyProxySettings' && node.initializer) {
      initializers.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(initializers.length, 1, 'one actual production proxy application function');
  const compiled = ts.transpileModule(`const apply = ${initializers[0].getText(source)}; apply;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  return runInNewContext(compiled, {logger: {info: (...args: unknown[]) => logs.push(args)}});
}

const cases = [
  ['http', '[::1]:8080', 'http=[::1]:8080;https=[::1]:8080'],
  ['https', 'proxy.example.test:443', 'http=https://proxy.example.test;https=https://proxy.example.test'],
  ['http', 'proxy.example.test:1080', 'http=proxy.example.test:1080;https=proxy.example.test:1080'],
  ['https', 'proxy.example.test:1080', 'http=https://proxy.example.test:1080;https=https://proxy.example.test:1080'],
  ['socks4', 'proxy.example.test:1080', 'socks=socks4://proxy.example.test:1080'],
  ['socks5', 'proxy.example.test:1080', 'socks=socks5://proxy.example.test:1080'],
  ['socks5', '[::1]:1080', 'socks=socks5://[::1]:1080'],
  ['socks4', 'proxy.example.test', 'socks=socks4://proxy.example.test'],
] as const;

describe('[CAP-005] production proxy rule application (inert session)', () => {
  for (const [protocol, host, rules] of cases) {
    it(`preserves ${protocol} endpoint ${host} without copying credentials`, async () => {
      const logs: unknown[][] = [];
      const configured: unknown[] = [];
      const domains: string[] = [];
      const proxy = new URL(`${protocol}://fixture-user:fixture-password@${host}/?private=fixture-query`);
      const apply = loadApplication(logs);
      await apply(proxy, {
        session: {
          allowNTLMCredentialsForDomains: (domain: string) => domains.push(domain),
          setProxy: async (config: unknown) => configured.push(config),
        },
      });
      assert.deepEqual(JSON.parse(JSON.stringify(configured)), [
        {pacScript: '', proxyBypassRules: '', proxyRules: rules},
      ]);
      assert.deepEqual(domains, [proxy.hostname]);
      assert.equal(logs.length, 1);
      assert.doesNotMatch(JSON.stringify([configured, logs]), /fixture-user|fixture-password|fixture-query/);
    });
  }

  it('awaits native proxy application and preserves its rejection for the caller', async () => {
    const apply = loadApplication([]);
    let reject!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const failure = new Error('owned proxy application failure');
    let settled = false;
    const application = apply(new URL('http://proxy.example.test:8080'), {
      session: {allowNTLMCredentialsForDomains() {}, setProxy: () => pending},
    });
    const observed = application.then(
      () => {
        settled = true;
      },
      error => {
        settled = true;
        throw error;
      },
    );
    await Promise.resolve();
    assert.equal(settled, false);
    const rejected = assert.rejects(observed, error => error === failure);
    reject(failure);
    await rejected;
  });
});
