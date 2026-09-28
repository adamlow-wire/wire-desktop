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

import {requestAccountPopupGrant} from './requestAccountPopupGrant';

import {ACCOUNT_POPUP_GRANT_CHANNEL} from '../security/AccountPopupGrantContract';

describe('account popup preload grant request [security-target][SEC-008]', () => {
  it('uses only the fixed channel and exact destination/name request', () => {
    const calls: unknown[][] = [];
    const result = requestAccountPopupGrant(
      {
        sendSync: (channel, request) => {
          calls.push([channel, request]);
          return '0123456789abcdef0123456789abcdef';
        },
      },
      'https://example.test/message',
      '_blank',
      {warn: () => assert.fail('valid grant must not warn')},
    );
    assert.strictEqual(result, '0123456789abcdef0123456789abcdef');
    assert.deepStrictEqual(calls, [
      [ACCOUNT_POPUP_GRANT_CHANNEL, {url: 'https://example.test/message', frameName: '_blank'}],
    ]);
  });

  it('fails closed with a fixed diagnostic on malformed or secret-bearing rejection', () => {
    const warnings: string[] = [];
    const logger = {warn: (message: string) => warnings.push(message)};
    assert.strictEqual(
      requestAccountPopupGrant({sendSync: () => 'forged'}, 'https://example.test', '_blank', logger),
      undefined,
    );
    assert.strictEqual(
      requestAccountPopupGrant(
        {
          sendSync: () => {
            throw new Error('secret credential and URL');
          },
        },
        'https://example.test',
        '_blank',
        logger,
      ),
      undefined,
    );
    assert.deepStrictEqual(warnings, [
      'Account popup authorization rejected.',
      'Account popup authorization rejected.',
    ]);
    assert.strictEqual(JSON.stringify(warnings).includes('secret'), false);
  });
});
