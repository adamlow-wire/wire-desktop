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

import {Session} from 'electron';

import {readFile} from 'node:fs/promises';
import path from 'node:path';

import {LocalContentRole, resolveLocalContentResource} from './LocalContentPolicy';

import {SECURE_SHELL_SCHEME} from '../secureShell/constants';

export const createLocalContentResponse = async (
  directory: string,
  role: LocalContentRole,
  request: Pick<Request, 'url' | 'method'>,
): Promise<Response> => {
  const headers = {
    'Content-Security-Policy': [
      "default-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      role === 'shell' ? "script-src 'self'" : "script-src 'none'",
      role === 'shell' ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
      role === 'shell' ? "img-src 'self' data:" : "img-src 'self'",
    ].join('; '),
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };
  const resource = resolveLocalContentResource(role, request.url, request.method);
  if (!resource) {
    return new Response(request.method === 'HEAD' ? null : 'Not found', {status: 404, headers});
  }
  try {
    // Only the policy's fixed asset path reaches the filesystem.
    const bytes = await readFile(path.join(directory, resource.path));
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), {
      headers: {...headers, 'Content-Type': resource.contentType},
    });
  } catch {
    return new Response(request.method === 'HEAD' ? null : 'Local resource unavailable', {status: 500, headers});
  }
};

export const installLocalContentProtocol = (
  target: Session,
  directory: string,
  role: LocalContentRole,
): (() => void) => {
  target.protocol.handle(SECURE_SHELL_SCHEME, request => createLocalContentResponse(directory, role, request));
  return () => target.protocol.unhandle(SECURE_SHELL_SCHEME);
};
