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

import {BrowserWindow, dialog} from 'electron';

import {AccountPermissionConsent} from './AccountPermissionPolicy';
import {createAccountPermissionPromptCopy} from './AccountPermissionPromptCopy';
import {parseNetworkNavigation} from './NavigationPolicy';

import * as locale from '../locale';

export function createAccountPermissionConsent(window: BrowserWindow): AccountPermissionConsent {
  let pending = false;
  const canPrompt: AccountPermissionConsent['canPrompt'] = identity =>
    !window.isDestroyed() &&
    window.isFocused() &&
    !identity.webContents.isDestroyed() &&
    identity.viewType === 'account';

  return {
    canPrompt,
    ask: async (identity, scopes, signal) => {
      const origin = parseNetworkNavigation(identity.allowedOrigin)?.origin;
      if (
        pending ||
        signal.aborted ||
        !canPrompt(identity) ||
        origin !== identity.allowedOrigin ||
        !scopes.length ||
        scopes.length > 3 ||
        new Set(scopes).size !== scopes.length ||
        !scopes.every(scope => ['audio', 'video', 'notifications'].includes(scope))
      ) {
        return false;
      }
      const copy = createAccountPermissionPromptCopy(origin, scopes, locale.getText);
      pending = true;
      const cancellation = new AbortController();
      const cancel = () => cancellation.abort();
      signal.addEventListener('abort', cancel, {once: true});
      window.once('closed', cancel);
      try {
        const result = await dialog.showMessageBox(window, {
          type: 'question',
          buttons: [locale.getText('promptCancel'), locale.getText('permissionAllow')],
          defaultId: 0,
          cancelId: 0,
          message: copy.title,
          detail: copy.detail,
          signal: cancellation.signal,
        });
        return result.response === 1 && !cancellation.signal.aborted && canPrompt(identity);
      } finally {
        signal.removeEventListener('abort', cancel);
        window.removeListener('closed', cancel);
        pending = false;
      }
    },
  };
}
