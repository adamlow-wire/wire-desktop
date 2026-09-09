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
  ACCOUNT_EVENT_CAPABILITY,
  ACCOUNT_EVENT_CHANNEL,
  AccountEvent,
  MAX_ACCOUNT_EVENTS_PER_MINUTE,
} from './AccountEventContract';
import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {AuthorizedViewIdentity, SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

const metadata = Joi.object({
  accentID: Joi.number(),
  availability: Joi.number(),
  darkMode: Joi.boolean(),
  name: Joi.string().max(4096),
  picture: Joi.string().max(2 * 1024 * 1024),
  teamID: Joi.string().max(256),
  teamRole: Joi.string().allow('').max(256),
  userID: Joi.string().max(256),
  webappUrl: Joi.string().max(8192),
})
  .unknown(false)
  .required();

const eventSchema = Joi.alternatives()
  .try(
    Joi.object({type: Joi.string().valid('loaded', 'sign-out', 'activate').required()}).unknown(false),
    Joi.object({type: Joi.valid('signed-out').required(), clearData: Joi.boolean().required()}).unknown(false),
    Joi.object({type: Joi.valid('metadata').required(), data: metadata}).unknown(false),
    Joi.object({type: Joi.valid('theme').required(), theme: Joi.string().max(32).required()}).unknown(false),
    Joi.object({
      type: Joi.valid('unread').required(),
      count: Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER).required(),
    }).unknown(false),
    Joi.object({type: Joi.valid('environment').required(), url: Joi.string().max(8192).required()}).unknown(false),
    Joi.object({
      type: Joi.valid('join').required(),
      code: Joi.string().max(8192).required(),
      key: Joi.string().max(8192).required(),
      domain: Joi.string().allow('', null).max(253),
    }).unknown(false),
  )
  .required();

export const isAccountEvent = (value: unknown): value is AccountEvent =>
  !eventSchema.validate(value, {convert: false}).error;

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

const contract: AuthorizedIpcContract<AccountEvent, void> = Object.freeze({
  capability: ACCOUNT_EVENT_CAPABILITY,
  channel: ACCOUNT_EVENT_CHANNEL,
  failureMode: 'reject',
  isRequest: isAccountEvent,
  isResponse: (value: unknown): value is void => value === undefined,
  originPolicy: 'registered-view-origin',
  rateLimit: Object.freeze({maxRequests: MAX_ACCOUNT_EVENTS_PER_MINUTE, windowMs: 60_000}),
  viewTypes: Object.freeze(['account'] as const),
});

export const bindAccountEventIpc = (
  ipc: IpcMainBinding,
  registry: ViewIdentityRegistry,
  receive: (identity: AuthorizedViewIdentity, event: AccountEvent) => void | Promise<void>,
): (() => void) => bindAuthorizedIpc(ipc, registry, contract, receive);
