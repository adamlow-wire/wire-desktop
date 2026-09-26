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

import {LANGUAGES} from '../locale/languages';

import {createAccountPermissionPromptCopy} from './AccountPermissionPromptCopy';

describe('[SEC-009] permission prompt copy', () => {
  const translate = (key: keyof typeof LANGUAGES.en): string => LANGUAGES.en[key];

  it('retains the account origin and each requested scope without changing the current prompt', () => {
    assert.deepEqual(createAccountPermissionPromptCopy('https://app.wire.test', ['audio', 'video'], translate), {
      title: 'Allow account permissions?',
      detail: 'https://app.wire.test\n\nMicrophone\nCamera',
    });
  });

  it('explains microphone, camera and notification access in plain language', () => {
    const cases = [
      {scope: 'audio' as const, reason: 'hear you'},
      {scope: 'video' as const, reason: 'see you'},
      {scope: 'notifications' as const, reason: 'new messages and calls'},
    ];
    for (const {scope, reason} of cases) {
      const copy = createAccountPermissionPromptCopy('https://app.wire.test', [scope], translate);
      assert.ok(copy.detail.includes(reason), `${scope} must explain its purpose`);
    }
  });
});
