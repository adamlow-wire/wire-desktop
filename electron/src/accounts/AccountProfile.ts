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

import Joi from '@hapi/joi';

import {randomUUID} from 'crypto';
import fs from 'fs';
import path from 'path';

import type {Account} from '../../renderer/src/types/account';
import {parseNetworkNavigation} from '../security/NavigationPolicy';

const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
const uuid = Joi.string().guid({version: ['uuidv4']});
const accountSchema = Joi.object({
  id: uuid.required(),
  sessionID: uuid,
  accountIndex: Joi.number().integer().min(0).default(0),
  accentID: Joi.number(),
  availability: Joi.number().default(0),
  badgeCount: Joi.number().min(0).default(0),
  darkMode: Joi.boolean().default(true),
  isAdding: Joi.boolean().default(true),
  name: Joi.string().allow('').max(4096),
  picture: Joi.string().allow('').max(MAX_PROFILE_BYTES),
  userID: Joi.string().max(256),
  teamID: Joi.string().max(256),
  teamRole: Joi.string().allow('').max(256).default(''),
  visible: Joi.boolean().default(false),
  webappUrl: Joi.string().max(8192),
  ssoCode: Joi.string().max(4096),
  conversationJoinData: Joi.object({
    code: Joi.string().max(8192).required(),
    key: Joi.string().max(8192).required(),
    domain: Joi.string().allow('', null).max(253),
  }),
});

const readJson = (serialized: string): unknown => {
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PROFILE_BYTES) {
    throw new Error('Account profile exceeds the size limit.');
  }
  return JSON.parse(serialized);
};

const parseAccounts = (value: unknown, maximumAccounts: number): Account[] => {
  if (!Array.isArray(value) || value.length > maximumAccounts) {
    throw new Error('Account profile has an invalid account collection.');
  }
  const ids = new Set<string>();
  const partitions = new Set<string>();
  const accounts = value.map((candidate, index): Account => {
    const result = accountSchema.required().validate(candidate, {convert: false, stripUnknown: true});
    if (result.error) {
      throw new Error('Account profile contains an invalid record.');
    }
    const account = result.value as Account;
    const partition = account.sessionID ?? 'default';
    if (
      ids.has(account.id.toLowerCase()) ||
      partitions.has(partition.toLowerCase()) ||
      (account.webappUrl && !parseNetworkNavigation(account.webappUrl))
    ) {
      throw new Error('Account profile contains an invalid identity, partition or backend.');
    }
    ids.add(account.id.toLowerCase());
    partitions.add(partition.toLowerCase());
    return {...account, accountIndex: index, badgeCount: 0, lifecycle: undefined};
  });
  const visible = accounts.filter(account => account.visible);
  if (visible.length > 1) {
    throw new Error('Account profile has ambiguous selection.');
  }
  if (!visible.length && accounts.length) {
    accounts[0].visible = true;
  }
  return accounts;
};

export const parseLegacyAccounts = (serialized: string, maximumAccounts: number): Account[] => {
  const value = readJson(serialized) as {accounts?: unknown} | null;
  return parseAccounts(value?.accounts, maximumAccounts);
};

export class AccountProfile {
  constructor(private readonly filename: string, private readonly maximumAccounts: number) {}

  read(): Account[] | undefined {
    let serialized: string;
    try {
      if (fs.statSync(this.filename).size > MAX_PROFILE_BYTES) {
        throw new Error('Account profile exceeds the size limit.');
      }
      serialized = fs.readFileSync(this.filename, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
    const value = readJson(serialized) as {version?: unknown; accounts?: unknown} | null;
    if (value?.version !== 1) {
      throw new Error('Account profile version is not supported.');
    }
    return parseAccounts(value.accounts, this.maximumAccounts);
  }

  importLegacy(serialized: string): Account[] {
    const existing = this.read();
    if (existing) {
      return existing;
    }
    const accounts = parseLegacyAccounts(serialized, this.maximumAccounts);
    this.write(accounts);
    return accounts;
  }

  write(accounts: readonly Account[]): void {
    const serialized = JSON.stringify({version: 1, accounts: parseAccounts(accounts, this.maximumAccounts)});
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PROFILE_BYTES) {
      throw new Error('Account profile exceeds the size limit.');
    }
    fs.mkdirSync(path.dirname(this.filename), {recursive: true, mode: 0o700});
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    const descriptor = fs.openSync(temporary, 'wx', 0o600);
    try {
      try {
        fs.writeFileSync(descriptor, serialized);
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      fs.renameSync(temporary, this.filename);
    } finally {
      if (fs.existsSync(temporary)) {
        fs.unlinkSync(temporary);
      }
    }
  }
}
