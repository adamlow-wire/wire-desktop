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

import {
  ACCOUNT_CONTROL_CAPABILITY,
  ACCOUNT_CONTROL_CHANNEL,
  AccountCommand,
  isAccountCommand,
  isAccountSnapshots,
  MAX_ACCOUNT_COMMANDS_PER_MINUTE,
} from './AccountControlContract';
import {AuthorizedIpcContract, bindAuthorizedIpc} from './AuthorizedIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

import type {AccountSnapshot} from '../accounts/AccountState';

interface IpcMainBinding {
  handle(channel: string, listener: (event: SenderIdentity, request: unknown) => Promise<unknown>): void;
  removeHandler(channel: string): void;
}

export interface AccountControl {
  snapshots(): readonly AccountSnapshot[];
  add(): Promise<void>;
  select(accountId: string): Promise<void>;
  remove(accountId: string): Promise<void>;
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
  bindAuthorizedIpc(ipc, registry, accountControlContract, async (_identity, command) => {
    switch (command.action) {
      case 'add':
        await control.add();
        break;
      case 'select':
        await control.select(command.accountId);
        break;
      case 'remove':
        await control.remove(command.accountId);
        break;
    }
    return control.snapshots();
  });
