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

import {createAccountPermissionPromptCopy} from './AccountPermissionPromptCopy';

import {LANGUAGES} from '../locale/languages';

describe('[SEC-009] permission prompt copy', () => {
  const translate = (key: keyof typeof LANGUAGES.en): string => LANGUAGES.en[key];

  it('retains the exact account origin and ordered scope names in the new prompt', () => {
    assert.deepEqual(createAccountPermissionPromptCopy('https://app.wire.test', ['audio', 'video'], translate), {
      brand: 'Wire',
      title: 'Use your camera and microphone?',
      origin: 'https://app.wire.test',
      originLabel: 'Requested by',
      allow: 'Allow',
      cancel: 'Not now',
      scopes: [
        {label: 'Microphone', reason: 'Wire needs your microphone so people in the call can hear you.'},
        {label: 'Camera', reason: 'Wire needs your camera so people in the call can see you.'},
      ],
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
      assert.ok(copy.scopes[0].reason.includes(reason), `${scope} must explain its purpose`);
    }
  });
});
