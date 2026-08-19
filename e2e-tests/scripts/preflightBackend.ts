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

import dotenv from 'dotenv';

import path from 'node:path';

import {normalizeBasicAuthorization} from '../../bin/test-tools/e2e-basic-authorization';

dotenv.config({path: path.resolve(__dirname, '../.env')});

const requireEnvironmentValue = (name: 'BACKEND_URL' | 'BACKEND_BASIC_AUTH') => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name}`);
  }
  return value;
};

const main = async () => {
  const backendUrl = requireEnvironmentValue('BACKEND_URL');
  const authorization = normalizeBasicAuthorization(requireEnvironmentValue('BACKEND_BASIC_AUTH'));
  const validationUrl = new URL('/i/users/activation-code', backendUrl);

  // Authentication is evaluated by nginz before Brig validates the missing
  // email parameter. A 4xx other than 401/403 therefore proves that the
  // credential passed without creating or modifying backend data.
  const response = await fetch(validationUrl, {
    headers: {Authorization: authorization, Accept: 'application/json'},
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(`The staging backend rejected E2E_BACKEND_BASIC_AUTH (HTTP ${response.status}).`);
  }
  if (response.status >= 500) {
    throw new Error(`The staging backend preflight failed at /i/users/activation-code (HTTP ${response.status}).`);
  }

  console.info(`E2E backend preflight passed (HTTP ${response.status}).`);
};

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
