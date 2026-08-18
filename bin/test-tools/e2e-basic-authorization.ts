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
 */

const isEncodedUserPassword = (value: string) => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, 'base64').toString('utf8');
  const canonical = Buffer.from(decoded, 'utf8').toString('base64');
  return canonical === value && decoded.includes(':');
};

/**
 * Accept the formats operators commonly receive from a secret store while
 * always returning a complete HTTP Basic Authorization header value.
 */
export const normalizeBasicAuthorization = (credential: string) => {
  const value = credential.trim();
  if (value.length === 0) {
    throw new Error('The E2E backend Basic authentication credential must not be empty.');
  }

  const completeHeader = value.match(/^Basic\s+(.+)$/i);
  const suppliedValue = completeHeader?.[1] ?? value;
  const token = suppliedValue.includes(':') ? Buffer.from(suppliedValue, 'utf8').toString('base64') : suppliedValue;

  if (!isEncodedUserPassword(token)) {
    throw new Error(
      'The E2E backend credential must be valid Basic authentication: username:password, base64(username:password), or Basic base64(username:password).',
    );
  }

  return `Basic ${token}`;
};
