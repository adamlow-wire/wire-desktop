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

import {createWebappBridge, exposeWebappBridge, WEBAPP_BRIDGE_VERSION} from './WebappBridge';

import * as EnvironmentUtil from '../runtime/EnvironmentUtil';

describe('webapp bridge', () => {
  const calls: Array<{args: unknown[]; name: string}> = [];
  const bridge = createWebappBridge({
    decrypt: async encrypted => {
      calls.push({args: [encrypted], name: 'decrypt'});
      return 'plain';
    },
    desktopAppConfig: {supportsWebViewRefresh: true, version: '3.44.0'},
    encrypt: async value => {
      calls.push({args: [value], name: 'encrypt'});
      return new Uint8Array([1]);
    },
    environment: EnvironmentUtil,
    getDesktopSources: async options => {
      calls.push({args: [options], name: 'sources'});
      return [];
    },
    getOpenGraphData: async url => {
      calls.push({args: [url], name: 'open-graph'});
      return {title: 'Example', url};
    },
  });

  beforeEach(() => calls.splice(0));

  it('[security-target][INV-002][SEC-005] exposes only the versioned compatibility names', () => {
    const exposed = new Map<string, unknown>();
    exposeWebappBridge({exposeInMainWorld: (name, value) => exposed.set(name, value)}, bridge);

    assert.deepStrictEqual(
      [...exposed.keys()],
      ['wireDesktopBridge', 'desktopAppConfig', 'desktopCapturer', 'environment', 'openGraphAsync', 'systemCrypto'],
    );
    assert.strictEqual(bridge.version, WEBAPP_BRIDGE_VERSION);
    assert.strictEqual(Object.isFrozen(bridge), true);
    assert.strictEqual(Object.isFrozen(bridge.desktopCapturer), true);
    assert.strictEqual(Object.isFrozen(bridge.systemCrypto), true);
  });

  it('[characterization][SEC-005] preserves capability arguments and results', async () => {
    const encrypted = new Uint8Array([2]);
    assert.strictEqual(await bridge.systemCrypto.decrypt(encrypted), 'plain');
    assert.deepStrictEqual(await bridge.systemCrypto.encrypt('value'), new Uint8Array([1]));
    assert.deepStrictEqual(await bridge.desktopCapturer.getDesktopSources({types: ['screen']}), []);
    assert.deepStrictEqual(await bridge.openGraphAsync('https://example.com'), {
      title: 'Example',
      url: 'https://example.com',
    });
    assert.deepStrictEqual(calls, [
      {args: [encrypted], name: 'decrypt'},
      {args: ['value'], name: 'encrypt'},
      {args: [{types: ['screen']}], name: 'sources'},
      {args: ['https://example.com'], name: 'open-graph'},
    ]);
  });
});
