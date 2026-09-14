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

import {ProxySetting, ProxySettings} from 'get-proxy-settings';

import {strict as assert} from 'assert';
import {URL} from 'url';

import {handleProxyLogin, ProxyLoginOptions} from './ProxyLogin';

const createFixture = (settings?: ProxySettings) => {
  const authenticated: Array<Array<string | undefined>> = [];
  const applied: Array<{proxy: URL; target: object}> = [];
  const saved: URL[] = [];
  let prompted = 0;
  const options: ProxyLoginOptions<object> = {
    authInfo: {host: 'proxy.example.test', port: 8080},
    webContents: {id: 2},
    getProxySettings: async () => settings,
    applyProxySettings: async (proxy, target) => void applied.push({proxy, target}),
    setProxyInfo: proxy => void saved.push(proxy),
    authenticate: (...credentials) => void authenticated.push(credentials),
    showPrompt: async () => void prompted++,
  };
  return {options, authenticated, applied, saved, prompted: () => prompted};
};

describe('proxy prompt automatic authentication', () => {
  for (const source of ['http', 'https'] as const) {
    it(`[CAP-005] uses matching ${source} credentials only on the challenged contents`, async () => {
      const state = createFixture({
        [source]: new ProxySetting('http://fixture-user:fixture-password@proxy.example.test:8080'),
      });
      await handleProxyLogin(state.options);
      assert.deepEqual(state.authenticated, [['fixture-user', 'fixture-password']]);
      assert.equal(state.applied.length, 1);
      assert.equal(state.applied[0].target, state.options.webContents);
      assert.equal(state.applied[0].proxy.href, 'http://fixture-user:fixture-password@proxy.example.test:8080/');
      assert.deepEqual(state.saved, [state.applied[0].proxy]);
      assert.equal(state.prompted(), 0);
    });
  }

  for (const proxy of [
    undefined,
    'http://proxy.example.test:8080',
    'http://foreign:secret@other.example.test:8080',
    'http://foreign:secret@proxy.example.test:8081',
  ]) {
    it(`[security-target][CAP-005] prompts without automatically using inapplicable credentials: ${
      proxy ? new URL(proxy).origin : 'absent settings'
    }`, async () => {
      const state = createFixture(proxy ? {http: new ProxySetting(proxy)} : undefined);
      await handleProxyLogin(state.options);
      assert.equal(state.prompted(), 1);
      assert.deepEqual(state.applied, []);
      assert.deepEqual(state.authenticated, []);
      assert.deepEqual(state.saved, []);
    });
  }

  it('[CAP-005] prompts when the native settings reader fails', async () => {
    const state = createFixture();
    state.options.getProxySettings = async () => {
      throw new Error('controlled reader failure');
    };
    await handleProxyLogin(state.options);
    assert.equal(state.prompted(), 1);
    assert.deepEqual(state.authenticated, []);
  });

  it('[security-target][CAP-005] cancels authentication and preserves state if applying settings fails', async () => {
    const state = createFixture({
      http: new ProxySetting('http://fixture-user:fixture-password@proxy.example.test:8080'),
    });
    state.options.applyProxySettings = async () => {
      throw new Error('controlled apply failure');
    };
    await assert.rejects(handleProxyLogin(state.options), /controlled apply failure/);
    assert.deepEqual(state.authenticated, [[]]);
    assert.deepEqual(state.saved, []);
    assert.equal(state.prompted(), 0);
  });
});
