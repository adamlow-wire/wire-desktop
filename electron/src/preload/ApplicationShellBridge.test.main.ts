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

import {WebAppEvents} from '@wireapp/webapp-events';

import {createApplicationShellBridge, exposeApplicationShellBridge} from './ApplicationShellBridge';

import {EVENT_TYPE} from '../lib/eventType';
import * as locale from '../locale';

describe('application shell bridge', () => {
  it('[security-target][INV-002][SEC-005] exposes only the fixed immutable compatibility surface', () => {
    const exposed = new Map<string, unknown>();
    const bridge = createApplicationShellBridge({
      deleteAccountData: async () => undefined,
      getWebContentsId: () => undefined,
      log: () => undefined,
      sendToAccount: () => undefined,
      submitDeepLink: () => undefined,
      updateBadgeCount: () => undefined,
    });

    exposeApplicationShellBridge(
      {exposeInMainWorld: (name, value) => exposed.set(name, value)},
      {isMac: false, locale: 'en', locStrings: locale.LANGUAGES.en, locStringsDefault: locale.LANGUAGES.en},
      bridge,
    );

    assert.strictEqual(Object.isFrozen(bridge), true);
    assert.deepStrictEqual(
      [...exposed.keys()],
      [
        'locStrings',
        'locStringsDefault',
        'locale',
        'isMac',
        'sendBadgeCount',
        'submitDeepLink',
        'sendDeleteAccount',
        'sendLogoutAccount',
        'sendConversationJoinToHost',
      ],
    );
  });

  it('[characterization][SEC-005] preserves exact account targeting and shell forwarding', async () => {
    const calls: Array<{args: unknown[]; name: string}> = [];
    const bridge = createApplicationShellBridge({
      deleteAccountData: async (...args) => {
        calls.push({args, name: 'delete'});
      },
      getWebContentsId: accountId => (accountId === 'account-a' ? 41 : undefined),
      log: message => calls.push({args: [message], name: 'log'}),
      sendToAccount: async (accountId, ...args) => {
        calls.push({args: [accountId, ...args], name: 'send'});
      },
      submitDeepLink: url => calls.push({args: [url], name: 'deep-link'}),
      updateBadgeCount: (count, ignoreFlash) => calls.push({args: [count, ignoreFlash], name: 'badge'}),
    });

    bridge.sendBadgeCount(3, true);
    bridge.submitDeepLink('wire://conversation/1');
    await bridge.sendDeleteAccount('account-a', 'partition-a');
    await bridge.sendLogoutAccount('account-a');
    await bridge.sendConversationJoinToHost('account-a', 'code', 'key', 'domain.example');

    assert.deepStrictEqual(
      calls.filter(call => call.name !== 'log'),
      [
        {args: [3, true], name: 'badge'},
        {args: ['wire://conversation/1'], name: 'deep-link'},
        {args: [41, 'account-a', 'partition-a'], name: 'delete'},
        {args: ['account-a', EVENT_TYPE.ACTION.SIGN_OUT], name: 'send'},
        {
          args: ['account-a', WebAppEvents.CONVERSATION.JOIN, {code: 'code', domain: 'domain.example', key: 'key'}],
          name: 'send',
        },
      ],
    );
    await assert.rejects(bridge.sendDeleteAccount('missing-account'), /does not exist/);
  });
});
