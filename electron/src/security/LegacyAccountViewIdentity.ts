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

import {ValidationUtil} from '@wireapp/commons';

import {MANAGED_CONFIG_CAPABILITY} from './ManagedConfigContract';
import {NOTIFICATION_ACTIVATION_CAPABILITY} from './NotificationActivationContract';
import {SAFE_STORAGE_DECRYPT_CAPABILITY, SAFE_STORAGE_ENCRYPT_CAPABILITY} from './SafeStorageContract';
import {SAVE_PICTURE_CAPABILITY} from './SavePictureContract';
import {WEBAPP_LOADED_CAPABILITY} from './WebAppLoadedContract';
import {
  RegisteredViewIdentity,
  registerViewIdentity,
  ViewIdentityRegistry,
  WebContentsIdentity,
} from './ViewIdentityRegistry';

export interface LegacyAccountWebContentsIdentity extends WebContentsIdentity {
  once(event: 'destroyed' | 'render-process-gone', listener: () => void): this;
}

export const registerLegacyAccountViewIdentity = (
  registry: ViewIdentityRegistry,
  webContents: LegacyAccountWebContentsIdentity,
  url: string,
  partition: string,
): RegisteredViewIdentity | undefined => {
  let accountUrl: URL;
  try {
    accountUrl = new URL(url);
  } catch {
    return undefined;
  }

  const accountId = accountUrl.searchParams.get('id');
  if (!accountId || !ValidationUtil.isUUIDv4(accountId) || !['http:', 'https:'].includes(accountUrl.protocol)) {
    return undefined;
  }

  return registerViewIdentity(registry, {
    accountId,
    allowedOrigin: accountUrl.origin,
    capabilities: [
      SAFE_STORAGE_ENCRYPT_CAPABILITY,
      SAFE_STORAGE_DECRYPT_CAPABILITY,
      MANAGED_CONFIG_CAPABILITY,
      SAVE_PICTURE_CAPABILITY,
      NOTIFICATION_ACTIVATION_CAPABILITY,
      WEBAPP_LOADED_CAPABILITY,
    ],
    partition,
    session: webContents.session,
    viewType: 'account',
    webContents,
  });
};
