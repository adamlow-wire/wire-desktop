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

import {SECURE_SHELL_ORIGIN} from '../secureShell/constants';

export type LocalContentRole = 'shell' | 'about' | 'proxy-prompt' | 'display-broker' | 'permission-consent';
export interface LocalContentResource {
  readonly path: string;
  readonly contentType: string;
}

export const LOCAL_CONTENT_ORIGIN = SECURE_SHELL_ORIGIN;

const resources: readonly (LocalContentResource & {readonly role: LocalContentRole})[] = [
  {role: 'display-broker', path: 'html/display-capture.html', contentType: 'text/html; charset=utf-8'},
  {role: 'display-broker', path: 'css/display-capture.css', contentType: 'text/css; charset=utf-8'},
  {role: 'permission-consent', path: 'html/account-permission.html', contentType: 'text/html; charset=utf-8'},
  {role: 'permission-consent', path: 'css/account-permission.css', contentType: 'text/css; charset=utf-8'},
  {role: 'shell', path: 'renderer/index.html', contentType: 'text/html; charset=utf-8'},
  {role: 'shell', path: 'renderer/dist/bundle.js', contentType: 'text/javascript; charset=utf-8'},
  {role: 'about', path: 'html/about.html', contentType: 'text/html; charset=utf-8'},
  {role: 'about', path: 'css/about.css', contentType: 'text/css; charset=utf-8'},
  {role: 'about', path: 'img/logo.256.png', contentType: 'image/png'},
  {role: 'proxy-prompt', path: 'html/proxy-prompt.html', contentType: 'text/html; charset=utf-8'},
  {role: 'proxy-prompt', path: 'css/proxy-prompt.css', contentType: 'text/css; charset=utf-8'},
];

export const resolveLocalContentResource = (
  role: LocalContentRole,
  requestUrl: string,
  method: string,
): LocalContentResource | undefined => {
  if ((method !== 'GET' && method !== 'HEAD') || requestUrl.length > 8192) {
    return undefined;
  }
  // Match the original URL, not a URL parser's normalized traversal/escape path.
  const prefix = `${LOCAL_CONTENT_ORIGIN}/`;
  if (!requestUrl.startsWith(prefix)) {
    return undefined;
  }
  const target = requestUrl.slice(prefix.length);
  const match = /^([a-zA-Z0-9./-]+)(?:\?([^#\s]*))?$/.exec(target);
  if (!match || match[0] !== target || (match[2] !== undefined && match[1] !== 'renderer/index.html')) {
    return undefined;
  }
  const resource = resources.find(resource => resource.role === role && resource.path === match[1]);
  return resource ? {path: resource.path, contentType: resource.contentType} : undefined;
};
