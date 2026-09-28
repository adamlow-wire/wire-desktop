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

import {
  ACCOUNT_PERMISSION_PROMPT_URL,
  isAccountPermissionPromptModel,
  isOwnedPermissionPromptSender,
} from './AccountPermissionPromptContract';
import {createAccountPermissionPromptCopy} from './AccountPermissionPromptCopy';

import {LANGUAGES} from '../locale/languages';

describe('[security-target][SEC-009] local permission prompt model', () => {
  const model = () =>
    createAccountPermissionPromptCopy('https://app.wire.test', ['audio'], key => LANGUAGES.en[key], 'Wire');

  it('admits only bounded, literal copy selected by main', () => {
    assert.equal(isAccountPermissionPromptModel(model()), true);
    for (const invalid of [
      {...model(), origin: 'https://app.wire.test\nAllow everything'},
      {...model(), scopes: []},
      {...model(), scopes: [{label: 'Microphone', reason: ''}]},
      {...model(), scopes: Array.from({length: 4}, () => model().scopes[0])},
      {...model(), scopes: [{label: 'Microphone', reason: 'Reason', sourceId: 'screen:0'}]},
      {...model(), choice: 'grant'},
      {...model(), title: 'x'.repeat(257)},
    ]) {
      assert.equal(isAccountPermissionPromptModel(invalid), false);
    }
  });

  it('accepts only the exact local prompt main frame and in-memory session', () => {
    const target = {};
    const mainFrame = {};
    const contents = {mainFrame, session: target, getURL: () => ACCOUNT_PERMISSION_PROMPT_URL};
    const event = {sender: contents, senderFrame: mainFrame};
    assert.equal(isOwnedPermissionPromptSender(event, contents, target), true);
    assert.equal(isOwnedPermissionPromptSender({...event, sender: {}}, contents, target), false);
    assert.equal(isOwnedPermissionPromptSender({...event, senderFrame: {}}, contents, target), false);
    assert.equal(isOwnedPermissionPromptSender({...event, senderFrame: null}, contents, target), false);
    assert.equal(isOwnedPermissionPromptSender(event, contents, {}), false);
    contents.getURL = () => 'https://app.wire.test/';
    assert.equal(isOwnedPermissionPromptSender(event, contents, target), false);
  });
});
