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

import {ModuleKind, ScriptTarget, transpileModule} from 'typescript';

import * as assert from 'assert';
import {readFileSync} from 'fs';
import * as path from 'path';
import {runInNewContext} from 'vm';

import {EVENT_TYPE} from './eventType';

import * as deepLinkPolicy from '../security/deepLinkPolicy';

function fixture(failure?: unknown) {
  const calls: unknown[][] = [];
  const failures: unknown[][] = [];
  const dialogs: string[] = [];
  const send = (...args: unknown[]) => {
    calls.push(args);
    if (failure !== undefined) {
      throw failure;
    }
  };
  const dependencies: Record<string, unknown> = {
    electron: {app: {}},
    path,
    './eventType': {EVENT_TYPE},
    '../lib/showDialog': {showErrorDialog: (message: string) => dialogs.push(message)},
    '../logging/getLogger': {getLogger: () => ({info() {}, error: (...args: unknown[]) => failures.push(args)})},
    '../runtime/EnvironmentUtil': {platform: {}},
    '../security/deepLinkPolicy': deepLinkPolicy,
    '../settings/config': {config: {customProtocolName: 'wire'}},
    '../window/WindowManager': {
      WindowManager: {
        sendActionToPrimaryWindow: send,
        async sendActionAndFocusWindow(...args: unknown[]) {
          send(...args);
        },
      },
    },
  };
  const filename = path.join(__dirname, 'CoreProtocol.ts');
  const compiled = transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ModuleKind.CommonJS, target: ScriptTarget.ES2022},
  }).outputText;
  const exports: {CustomProtocolHandler?: new () => {dispatchDeepLink(url: string): Promise<void>}} = {};
  runInNewContext(compiled, {
    exports,
    __filename: filename,
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected protocol fixture dependency: ${name}`);
      return dependencies[name];
    },
  });
  assert.ok(exports.CustomProtocolHandler);
  return {handler: new exports.CustomProtocolHandler(), calls, failures, dialogs};
}

const routes = [
  {url: 'wire://start-login', expected: [EVENT_TYPE.ACTION.START_LOGIN]},
  {
    url: 'wire://start-sso/wire-13266298-4ac8-44b5-8281-dfb9e95fab5c',
    expected: [EVENT_TYPE.ACCOUNT.SSO_LOGIN, 'wire-13266298-4ac8-44b5-8281-dfb9e95fab5c'],
  },
  {
    url: 'wire://conversation-join?code=fixture-code&key=fixture-key',
    expected: [EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code: 'fixture-code', key: 'fixture-key', domain: null}],
  },
  {url: 'wire://preferences/account', expected: [EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, '/preferences/account']},
];

describe('deep-link dispatch diagnostic boundary (inert Node ports)', () => {
  for (const {url, expected} of routes) {
    it(`preserves exact successful dispatch for ${expected[0]}`, async () => {
      const f = fixture();
      await f.handler.dispatchDeepLink(url);
      assert.deepStrictEqual(JSON.parse(JSON.stringify(f.calls)), [expected]);
      assert.deepStrictEqual(f.failures, []);
      assert.deepStrictEqual(f.dialogs, []);
    });

    it(`[security-target][INV-010][SEC-013] contains and diagnoses ${expected[0]} failure without error payloads`, async () => {
      const secret = 'fixture-private-dispatch';
      const error = Object.assign(new Error(secret), {request: {url, authorization: secret}});
      const f = fixture(error);
      await assert.doesNotReject(() => f.handler.dispatchDeepLink(url));
      assert.deepStrictEqual(JSON.parse(JSON.stringify(f.calls)), [expected]);
      assert.deepStrictEqual(f.failures, [['Failed to dispatch deep link.']]);
      assert.deepStrictEqual(f.dialogs, []);
    });
  }

  it('rejects malformed input without dispatch or input-bearing diagnostics', async () => {
    const f = fixture();
    await f.handler.dispatchDeepLink('wire://conversation-join?key=fixture-private-key');
    assert.deepStrictEqual(f.calls, []);
    assert.deepStrictEqual(f.failures, []);
    assert.deepStrictEqual(f.dialogs, ['Invalid deep link.']);
  });
});
