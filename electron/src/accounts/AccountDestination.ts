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

import type {Account} from '../../renderer/src/types/account';
import {parseNetworkNavigation} from '../security/NavigationPolicy';
import type {WindowsMsiWebAppConfiguration} from '../settings/WindowsMsiConfiguration';

export function assertManagedAccountDestination(
  candidate: string,
  managed: Readonly<WindowsMsiWebAppConfiguration>,
): void {
  if (!managed.isConfigured) {
    return;
  }
  const enforced = parseNetworkNavigation(managed.url ?? '');
  if (!enforced || enforced.protocol !== 'https:') {
    throw new Error('Invalid managed account destination.');
  }
  if (parseNetworkNavigation(candidate)?.origin !== enforced.origin) {
    throw new Error('Account destination conflicts with machine policy.');
  }
}

export function getAccountDestination(
  account: Pick<Account, 'webappUrl' | 'ssoCode' | 'isAdding'>,
  defaultUrl: string,
  locale: string,
  managed: Readonly<WindowsMsiWebAppConfiguration> = {isConfigured: false},
): string {
  const candidate = account.webappUrl || defaultUrl;
  assertManagedAccountDestination(candidate, managed);
  const url = new URL(candidate);
  url.searchParams.set('hl', locale);
  if (account.ssoCode && account.isAdding) {
    url.pathname = '/auth';
    url.hash = `#sso/${account.ssoCode}`;
  }
  return url.href;
}
