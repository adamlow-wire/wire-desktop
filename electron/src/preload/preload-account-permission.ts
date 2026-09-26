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

import {ipcRenderer} from 'electron';

import {
  ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_URL,
  isAccountPermissionPromptModel,
} from '../security/AccountPermissionPromptContract';

if (process.isMainFrame && window.location.href === ACCOUNT_PERMISSION_PROMPT_URL) {
  let rendered = false;
  let decided = false;
  const decide = (allowed: boolean): void => {
    if (decided) {
      return;
    }
    decided = true;
    ipcRenderer.send(ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL, allowed);
  };
  ipcRenderer.once(ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL, (_event, value: unknown) => {
    if (rendered || !isAccountPermissionPromptModel(value)) {
      decide(false);
      return;
    }
    rendered = true;
    document.title = value.title;
    document.getElementById('brand-name')!.textContent = value.brand;
    document.getElementById('permission-title')!.textContent = value.title;
    document.getElementById('origin-label')!.textContent = value.originLabel;
    const origin = document.getElementById('requesting-origin')!;
    origin.textContent = value.origin;
    origin.title = value.origin;
    const scopes = document.getElementById('permission-scopes')!;
    for (const scope of value.scopes) {
      const card = document.createElement('div');
      card.className = 'scope';
      const label = document.createElement('strong');
      label.textContent = scope.label;
      const reason = document.createElement('p');
      reason.textContent = scope.reason;
      card.append(label, reason);
      scopes.append(card);
    }
    const cancel = document.getElementById('permission-cancel') as HTMLButtonElement;
    const allow = document.getElementById('permission-allow') as HTMLButtonElement;
    cancel.textContent = value.cancel;
    allow.textContent = value.allow;
    cancel.addEventListener('click', () => decide(false), {once: true});
    allow.addEventListener('click', () => decide(true), {once: true});
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        decide(false);
      }
    });
    cancel.focus();
    ipcRenderer.send(ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL);
  });
}
