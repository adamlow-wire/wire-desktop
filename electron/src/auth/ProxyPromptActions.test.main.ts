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

import {strict as assert} from 'assert';
import {URL} from 'url';

import {createProxyPromptActions, CreateProxyPromptActionsOptions} from './ProxyPromptActions';

const createOptions = () => {
  const applied: Array<{proxy: URL; webContents: unknown}> = [];
  const authenticated: string[][] = [];
  const dialogs: string[] = [];
  const errors: unknown[][] = [];
  const logs: string[] = [];
  const proxyUpdates: URL[] = [];
  const setProxyCalls: object[] = [];
  let reloads = 0;
  const options: CreateProxyPromptActionsOptions = {
    applyProxySettings: async (proxy, webContents) => void applied.push({proxy, webContents}),
    authenticate: (username, password) => void authenticated.push([username, password]),
    authInfo: {host: 'proxy.example.test', port: 8080},
    challengedSession: {setProxy: async config => void setProxyCalls.push(config)},
    getProxyInfo: () => new URL('https://proxy.example.test:8080'),
    logger: {
      error: (...args: unknown[]) => void errors.push(args),
      log: message => void logs.push(message),
    },
    mainWindow: {
      reload: () => void (reloads += 1),
      webContents: {id: 99},
    },
    setProxyInfo: proxy => void proxyUpdates.push(proxy),
    showErrorDialog: message => void dialogs.push(message),
  };
  return {
    applied,
    authenticated,
    dialogs,
    errors,
    getReloads: () => reloads,
    logs,
    options,
    proxyUpdates,
    setProxyCalls,
  };
};

describe('proxy prompt actions', () => {
  it('[characterization][CAP-005] applies submitted credentials and completes the proxy challenge', async () => {
    const state = createOptions();
    const actions = createProxyPromptActions(state.options);

    await actions.submit({password: 'p/a:ss', username: 'proxy-user'});

    assert.strictEqual(state.proxyUpdates.length, 1);
    assert.strictEqual(state.proxyUpdates[0].protocol, 'https:');
    assert.strictEqual(state.proxyUpdates[0].hostname, 'proxy.example.test');
    assert.strictEqual(state.proxyUpdates[0].port, '8080');
    assert.strictEqual(state.proxyUpdates[0].username, 'proxy-user');
    assert.strictEqual(state.proxyUpdates[0].password, 'p%2Fa%3Ass');
    assert.deepStrictEqual(state.applied, [
      {proxy: state.proxyUpdates[0], webContents: state.options.mainWindow.webContents},
    ]);
    assert.deepStrictEqual(state.authenticated, [['proxy-user', 'p/a:ss']]);
    assert.strictEqual(state.logs.length, 2);
  });

  it('[characterization][CAP-005] clears proxy state and reloads after cancellation', async () => {
    const state = createOptions();

    await createProxyPromptActions(state.options).cancel();

    assert.deepStrictEqual(state.setProxyCalls, [{}]);
    assert.strictEqual(state.getReloads(), 1);
    assert.deepStrictEqual(state.dialogs, []);
    assert.deepStrictEqual(state.errors, []);
  });

  it('[characterization][INV-010][CAP-005] contains and reports a reload failure', async () => {
    const state = createOptions();
    const controlledFailure = new Error('controlled reload failure');
    state.options.mainWindow.reload = () => {
      throw controlledFailure;
    };

    await createProxyPromptActions(state.options).cancel();

    assert.deepStrictEqual(state.dialogs, ['Could not reload the window: controlled reload failure']);
    assert.deepStrictEqual(state.errors, [['Could not reload the window:', controlledFailure]]);
  });
});
