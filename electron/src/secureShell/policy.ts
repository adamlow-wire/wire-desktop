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

import {createHash} from 'crypto';

import {SECURE_SHELL_CONTRACT_VERSION} from './constants';

export interface RuntimeInfoRequest {
  contractVersion: typeof SECURE_SHELL_CONTRACT_VERSION;
}

export const parseSecureAccountUrl = (value: string, allowHttpForTest = false): URL => {
  const url = new URL(value);
  const protocolAllowed = url.protocol === 'https:' || (allowHttpForTest && url.protocol === 'http:');

  if (!protocolAllowed || url.username || url.password || url.origin === 'null') {
    throw new Error('Secure shell account URL is not an allowed origin.');
  }

  return url;
};

export const isAllowedAccountNavigation = (value: string, allowedOrigin: string): boolean => {
  try {
    return new URL(value).origin === allowedOrigin;
  } catch {
    return false;
  }
};

export const isRuntimeInfoRequest = (value: unknown): value is RuntimeInfoRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && record.contractVersion === SECURE_SHELL_CONTRACT_VERSION;
};

export const createSecureAccountPartition = (accountId: string): string => {
  if (!accountId || accountId.length > 256) {
    throw new Error('Secure shell account identifier is invalid.');
  }

  const digest = createHash('sha256').update(accountId).digest('hex');
  return `persist:wire-secure-${digest}`;
};
