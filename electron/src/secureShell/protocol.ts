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

import {protocol} from 'electron';

import {SECURE_SHELL_SCHEME} from './constants';

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "img-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'none'",
  "style-src 'self'",
].join('; ');

const SHELL_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Wire secure shell proof</title>
  </head>
  <body><main aria-label="Wire secure account view"></main></body>
</html>`;

export const registerSecureShellSchemePrivileges = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SECURE_SHELL_SCHEME,
      privileges: {
        codeCache: false,
        corsEnabled: false,
        secure: true,
        standard: true,
        stream: true,
        supportFetchAPI: false,
      },
    },
  ]);
};

export const createSecureShellResponse = (requestUrl: string): Response => {
  const url = new URL(requestUrl);
  const allowed =
    url.protocol === `${SECURE_SHELL_SCHEME}:` &&
    url.hostname === 'shell' &&
    !url.port &&
    !url.username &&
    !url.password &&
    (url.pathname === '/' || url.pathname === '/index.html');

  if (!allowed) {
    return new Response('Not found', {status: 404});
  }

  return new Response(SHELL_HTML, {
    headers: {
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Content-Type': 'text/html; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};

export const installSecureShellProtocol = (): (() => void) => {
  protocol.handle(SECURE_SHELL_SCHEME, request => createSecureShellResponse(request.url));

  return () => protocol.unhandle(SECURE_SHELL_SCHEME);
};

export {CONTENT_SECURITY_POLICY};
