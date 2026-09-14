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

import type {AccountSnapshot} from '../accounts/AccountState';
import {ACCOUNT_CONTROL_CHANNEL, ACCOUNT_SNAPSHOTS_CHANNEL, AccountCommand} from '../security/AccountControlContract';

interface ShellIpc {
  invoke(channel: string, request: AccountCommand): Promise<unknown>;
  on(channel: string, listener: (event: unknown, accounts: readonly AccountSnapshot[]) => void): void;
}

export interface AccountShellBridge {
  read(): Promise<readonly AccountSnapshot[]>;
  add(): Promise<void>;
  select(accountId: string): Promise<void>;
  remove(accountId: string): Promise<void>;
  reload(accountId: string): Promise<void>;
  logout(accountId: string): Promise<void>;
  contextMenu(accountId: string): Promise<void>;
  layout(sidebarWidth: number, headerHeight: number): Promise<void>;
  join(accountId: string, code: string, key: string, domain?: string | null): Promise<void>;
  subscribe(listener: (accounts: readonly AccountSnapshot[]) => void): () => void;
}

export const createAccountShellBridge = (ipc: ShellIpc): Readonly<AccountShellBridge> => {
  let revision = 0;
  let latest: readonly AccountSnapshot[] = [];
  const listeners = new Set<(accounts: readonly AccountSnapshot[]) => void>();
  const publish = (accounts: readonly AccountSnapshot[]): void => {
    latest = accounts;
    revision++;
    for (const listener of listeners) {
      try {
        listener(accounts);
      } catch {
        console.warn('Account display listener failed.');
      }
    }
  };
  ipc.on(ACCOUNT_SNAPSHOTS_CHANNEL, (_event, accounts) => publish(accounts));
  const request = async (command: AccountCommand): Promise<readonly AccountSnapshot[]> => {
    const startedAt = revision;
    const result = (await ipc.invoke(ACCOUNT_CONTROL_CHANNEL, command)) as readonly AccountSnapshot[];
    // A newer pushed state wins over an older in-flight command response.
    if (revision === startedAt) {
      publish(result);
    }
    return latest;
  };
  const act = async (command: AccountCommand): Promise<void> => {
    await request(command);
  };
  return Object.freeze({
    read: () => request({action: 'read'}),
    add: () => act({action: 'add'}),
    select: (accountId: string) => act({action: 'select', accountId}),
    remove: (accountId: string) => act({action: 'remove', accountId}),
    reload: (accountId: string) => act({action: 'reload', accountId}),
    logout: (accountId: string) => act({action: 'logout', accountId}),
    contextMenu: (accountId: string) => act({action: 'context-menu', accountId}),
    layout: (sidebarWidth: number, headerHeight: number) => act({action: 'layout', sidebarWidth, headerHeight}),
    join: (accountId: string, code: string, key: string, domain?: string | null) =>
      act({action: 'join', accountId, code, key, domain}),
    subscribe: (listener: (accounts: readonly AccountSnapshot[]) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
};
