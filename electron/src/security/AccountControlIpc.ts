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

import {
  ACCOUNT_CONTROL_CAPABILITY,
  ACCOUNT_CONTROL_CHANNEL,
  AccountCommand,
  MAX_ACCOUNT_COMMANDS_PER_MINUTE,
} from './AccountControlContract';
import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {AuthorizedViewIdentity, SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

import type {AccountSnapshot} from '../accounts/AccountState';

const commandSchema = Joi.alternatives()
  .try(
    Joi.object({action: Joi.string().valid('read', 'add').required()}).unknown(false),
    Joi.object({
      action: Joi.string().valid('select', 'remove').required(),
      accountId: Joi.string()
        .guid({version: ['uuidv4']})
        .required(),
    }).unknown(false),
  )
  .required();

export const isAccountCommand = (value: unknown): value is AccountCommand =>
  !commandSchema.validate(value, {convert: false}).error;

const snapshotSchema = Joi.object({
  id: Joi.string()
    .guid({version: ['uuidv4']})
    .required(),
  accountIndex: Joi.number().integer().min(0).required(),
  availability: Joi.number(),
  accentID: Joi.number(),
  badgeCount: Joi.number().integer().min(0).required(),
  darkMode: Joi.boolean().required(),
  isAdding: Joi.boolean().required(),
  visible: Joi.boolean().required(),
  canCancel: Joi.boolean().required(),
  name: Joi.string().allow('').max(4096),
  picture: Joi.string()
    .allow('')
    .max(2 * 1024 * 1024),
  teamID: Joi.string().max(256),
  userID: Joi.string().max(256),
  teamRole: Joi.string().allow('').max(256).required(),
  lifecycle: Joi.string().max(256),
  webappUrl: Joi.string().max(8192),
})
  .unknown(false)
  .required();
const snapshotsSchema = Joi.array().items(snapshotSchema).min(1).max(32).required();

export const isAccountSnapshots = (value: unknown): value is readonly AccountSnapshot[] =>
  !snapshotsSchema.validate(value, {convert: false}).error;

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

export interface AccountControl {
  snapshots(): readonly AccountSnapshot[];
  add(identity: AuthorizedViewIdentity): Promise<void>;
  select(accountId: string, identity: AuthorizedViewIdentity): Promise<void>;
  remove(accountId: string, identity: AuthorizedViewIdentity): Promise<void>;
}

const accountControlContract: AuthorizedIpcContract<AccountCommand, readonly AccountSnapshot[]> = Object.freeze({
  capability: ACCOUNT_CONTROL_CAPABILITY,
  channel: ACCOUNT_CONTROL_CHANNEL,
  failureMode: 'reject',
  isRequest: isAccountCommand,
  isResponse: isAccountSnapshots,
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_ACCOUNT_COMMANDS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['application-shell'] as const),
});

export const bindAccountControlIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  control: AccountControl,
): (() => void) =>
  bindAuthorizedIpc(ipc, registry, accountControlContract, async (identity, command) => {
    switch (command.action) {
      case 'add':
        await control.add(identity);
        break;
      case 'select':
        await control.select(command.accountId, identity);
        break;
      case 'remove':
        await control.remove(command.accountId, identity);
        break;
    }
    return control.snapshots();
  });
