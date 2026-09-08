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

import {parseDeepLink} from './deepLinkPolicy';
import {parseExternalUrl} from './externalLinkPolicy';

export const parseNetworkNavigation = (value: string): URL | undefined => {
  if (!value || value.length > 8192 || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
};

export const isAllowedAccountNavigation = (value: string, allowedOrigin: string | undefined): boolean => {
  const url = parseNetworkNavigation(value);
  return Boolean(url && allowedOrigin && url.origin === allowedOrigin);
};

export type AccountPopupDecision = 'sso' | 'picture-in-picture' | 'external' | 'deep-link' | 'deny';

export const isAllowedSsoNavigation = (value: string, initialOrigin: string, callbackProtocol: string): boolean => {
  const networkUrl = parseNetworkNavigation(value);
  if (networkUrl) {
    return networkUrl.protocol === 'https:' || networkUrl.origin === initialOrigin;
  }
  if (!value || value.length > 255 || /[\u0000-\u0020\u007f\\]/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === `${callbackProtocol}:` &&
      url.host === 'response' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.pathname === '' || url.pathname === '/')
    );
  } catch {
    return false;
  }
};

export const selectAccountPopup = (request: {
  url: string;
  frameName: string;
  accountOrigin: string | undefined;
  referrerUrl: string;
  sourceUrl: string;
}): AccountPopupDecision => {
  if (
    !isAllowedAccountNavigation(request.sourceUrl, request.accountOrigin) ||
    (request.referrerUrl !== '' && !isAllowedAccountNavigation(request.referrerUrl, request.accountOrigin))
  ) {
    return 'deny';
  }
  const url = parseNetworkNavigation(request.url);
  if (request.frameName === 'WIRE_SSO') {
    return url && (url.protocol === 'https:' || url.origin === request.accountOrigin) ? 'sso' : 'deny';
  }
  if (request.frameName === 'WIRE_PICTURE_IN_PICTURE_CALL') {
    return request.url === 'about:blank' ||
      request.url === '' ||
      isAllowedAccountNavigation(request.url, request.accountOrigin)
      ? 'picture-in-picture'
      : 'deny';
  }
  if (parseDeepLink(request.url)) {
    return 'deep-link';
  }
  if (parseExternalUrl(request.url)) {
    return 'external';
  }
  return 'deny';
};
