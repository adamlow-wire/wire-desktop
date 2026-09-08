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

import type {HandlerDetails, Session, WindowOpenHandlerResponse} from 'electron';

import {selectAccountPopup} from './NavigationPolicy';

import {getPictureInPictureCallWindowOptions} from '../calling/PictureInPictureCall';

export const handleAccountWindowOpen = (
  details: HandlerDetails,
  context: {
    accountSession: Session;
    accountOrigin: string | undefined;
    openExternal: (url: string) => void;
    openSso: (url: string) => void;
  },
): WindowOpenHandlerResponse => {
  const decision = selectAccountPopup({
    url: details.url,
    frameName: details.frameName,
    referrerUrl: details.referrer.url,
    accountOrigin: context.accountOrigin,
  });
  if (decision === 'sso') {
    context.openSso(details.url);
    return {action: 'deny'};
  }
  if (decision === 'picture-in-picture') {
    const options = getPictureInPictureCallWindowOptions();
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...options,
        webPreferences: {...options.webPreferences, session: context.accountSession},
      },
    };
  }
  if (decision === 'external') {
    context.openExternal(details.url);
  }
  return {action: 'deny'};
};
