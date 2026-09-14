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

import {assertManagedAccountDestination} from './AccountDestination';

import * as locale from '../locale';
import {parseNetworkNavigation} from '../security/NavigationPolicy';
import type {WindowsMsiWebAppConfiguration} from '../settings/WindowsMsiConfiguration';

export async function approveAccountEnvironment(
  owner: BrowserWindow,
  candidate: string,
  managed: Readonly<WindowsMsiWebAppConfiguration> = {isConfigured: false},
): Promise<string> {
  const destination = parseNetworkNavigation(candidate);
  if (!destination) {
    throw new Error('Invalid account destination.');
  }
  assertManagedAccountDestination(candidate, managed);
  if (owner.isDestroyed()) {
    throw new Error('Account window is not available.');
  }
  const result = await dialog.showMessageBox(owner, {
    type: 'question',
    buttons: [locale.getText('promptCancel'), locale.getText('changeEnvironmentModalConfirm')],
    defaultId: 0,
    cancelId: 0,
    message: locale.getText('changeEnvironmentModalTitle'),
    detail: locale.getText('changeEnvironmentModalText').replaceAll('{url}', () => destination.origin),
  });
  if (owner.isDestroyed()) {
    throw new Error('Account window is not available.');
  }
  if (result.response !== 1) {
    throw new Error('Account destination was not approved.');
  }
  return candidate;
}
