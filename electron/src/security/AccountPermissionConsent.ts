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

import {BrowserWindow} from 'electron';

import {AccountPermissionConsent} from './AccountPermissionPolicy';
import {showAccountPermissionPrompt} from './AccountPermissionPrompt';
import {createAccountPermissionPromptCopy} from './AccountPermissionPromptCopy';
import {parseNetworkNavigation} from './NavigationPolicy';

import * as locale from '../locale';
import {config} from '../settings/config';

export function createAccountPermissionConsent(
  window: BrowserWindow,
  present: typeof showAccountPermissionPrompt = showAccountPermissionPrompt,
): AccountPermissionConsent {
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
      const copy = createAccountPermissionPromptCopy(origin, scopes, locale.getText, config.name);
      pending = true;
      const cancellation = new AbortController();
      const cancel = () => cancellation.abort();
      signal.addEventListener('abort', cancel, {once: true});
      window.once('closed', cancel);
      try {
        const accepted = await present(window, copy, cancellation.signal);
        if (accepted !== true || cancellation.signal.aborted || window.isDestroyed()) {
          return false;
        }
        if (!window.isFocused()) {
          if (!window.isVisible() || window.isMinimized()) {
            return false;
          }
          try {
            window.focus();
          } catch {
            return false;
          }
          if (!window.isFocused()) {
            const focused = await new Promise<boolean>(resolve => {
              let settled = false;
              const finish = (value: boolean): void => {
                if (settled) {
                  return;
                }
                settled = true;
                clearTimeout(timeout);
                window.removeListener('focus', onFocus);
                window.removeListener('closed', onClose);
                cancellation.signal.removeEventListener('abort', onClose);
                resolve(value);
              };
              const onFocus = (): void => finish(true);
              const onClose = (): void => finish(false);
              const timeout = setTimeout(onClose, 1500);
              window.once('focus', onFocus);
              window.once('closed', onClose);
              cancellation.signal.addEventListener('abort', onClose, {once: true});
              if (window.isFocused()) {
                finish(true);
              }
            });
            if (!focused) {
              return false;
            }
          }
        }
        return !cancellation.signal.aborted && canPrompt(identity);
      } finally {
        signal.removeEventListener('abort', cancel);
        window.removeListener('closed', cancel);
        pending = false;
      }
    },
  };
}
