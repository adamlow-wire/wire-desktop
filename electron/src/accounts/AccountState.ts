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

import {randomUUID} from 'crypto';

import type {Account} from '../../renderer/src/types/account';
import {EVENT_TYPE} from '../lib/eventType';
import type {AccountEvent} from '../security/AccountEventContract';
import {isSsoCode} from '../security/deepLinkPolicy';

export class AccountLimitError extends Error {
  constructor() {
    super('Maximum account count reached.');
  }
}

export type AccountSnapshot = Readonly<
  Omit<Account, 'sessionID' | 'ssoCode' | 'conversationJoinData'> & {
    canCancel: boolean;
    isLoading?: boolean;
    loadError?: string;
  }
>;

const createAccount = (): Account => ({
  id: randomUUID(),
  sessionID: randomUUID(),
  accountIndex: 0,
  availability: 0,
  badgeCount: 0,
  darkMode: true,
  isAdding: true,
  teamRole: '',
  visible: true,
});

// Main-process state only. IPC must authorize named operations before calling this owner.
export class AccountState {
  private accounts: Account[];

  constructor(
    initial: readonly Account[],
    private readonly maximumAccounts: number,
    private readonly persist: (accounts: readonly Account[]) => void,
  ) {
    this.accounts = structuredClone([...initial]);
    if (!this.accounts.length) {
      this.commit([createAccount()]);
    }
  }

  snapshots(): readonly AccountSnapshot[] {
    return Object.freeze(
      this.accounts.map(account => {
        const display = {...account};
        delete display.sessionID;
        delete display.ssoCode;
        delete display.conversationJoinData;
        return Object.freeze({...display, canCancel: !account.userID && this.accounts.length > 1});
      }),
    );
  }

  get(accountId: string): Account {
    const account = this.accounts.find(candidate => candidate.id === accountId);
    if (!account) {
      throw new Error('Unknown account.');
    }
    return structuredClone(account);
  }

  // Destructive events and environment changes require controller side effects/policy first.
  update(accountId: string, event: Exclude<AccountEvent, {type: 'signed-out' | 'environment'}>): void {
    const account = this.get(accountId);
    switch (event.type) {
      case 'metadata': {
        const previousUrl = account.webappUrl;
        Object.assign(account, event.data, {isAdding: false, ssoCode: undefined});
        if (previousUrl && !event.data.webappUrl) {
          account.webappUrl = previousUrl;
        }
        if (!event.data.picture) {
          delete account.picture;
        }
        break;
      }
      case 'loaded':
        account.lifecycle = EVENT_TYPE.LIFECYCLE.SIGNED_IN;
        break;
      case 'sign-out':
        account.lifecycle = EVENT_TYPE.LIFECYCLE.SIGN_OUT;
        break;
      case 'theme':
        account.darkMode = event.theme === 'dark';
        break;
      case 'unread':
        if (event.count === account.badgeCount || (!account.visible && event.count < account.badgeCount)) {
          return;
        }
        account.badgeCount = event.count;
        break;
      case 'join':
        account.conversationJoinData = {code: event.code, key: event.key, domain: event.domain};
        break;
      case 'activate':
        this.select(accountId);
        return;
    }
    this.replace(account);
  }

  clearPendingJoin(accountId: string): void {
    const account = this.get(accountId);
    delete account.conversationJoinData;
    this.replace(account);
  }

  resetIdentity(accountId: string): void {
    const account = this.get(accountId);
    delete account.userID;
    delete account.teamID;
    this.replace(account);
  }

  setEnvironment(accountId: string, webappUrl: string): void {
    const account = this.get(accountId);
    account.webappUrl = webappUrl;
    this.replace(account);
  }

  private replace(account: Account): void {
    this.commit(this.accounts.map(record => (record.id === account.id ? account : record)));
  }

  add(ssoCode?: string): string {
    if (ssoCode !== undefined && !isSsoCode(ssoCode)) {
      throw new Error('Invalid SSO code.');
    }
    const unbound = this.accounts.find(account => !account.userID);
    if (unbound) {
      this.commit(
        this.accounts.map(account => ({
          ...account,
          visible: account.id === unbound.id,
          badgeCount: account.id === unbound.id ? 0 : account.badgeCount,
          ...(account.id === unbound.id && ssoCode !== undefined ? {ssoCode, isAdding: true} : {}),
        })),
      );
      return unbound.id;
    }
    if (this.accounts.length >= this.maximumAccounts) {
      throw new AccountLimitError();
    }
    const account = createAccount();
    if (ssoCode !== undefined) {
      account.ssoCode = ssoCode;
    }
    this.commit([...this.accounts.map(record => ({...record, visible: false})), account]);
    return account.id;
  }

  select(accountId: string): void {
    this.get(accountId);
    this.commit(
      this.accounts.map(account => ({
        ...account,
        visible: account.id === accountId,
        badgeCount: account.id === accountId ? 0 : account.badgeCount,
      })),
    );
  }

  // Call only after the controller has completed exact-account view/data disposal.
  remove(accountId: string): void {
    this.get(accountId);
    const remaining = this.accounts.filter(account => account.id !== accountId);
    this.commit(
      remaining.length
        ? remaining.map((account, index) => ({
            ...account,
            accountIndex: index,
            visible: index === remaining.length - 1,
            badgeCount: index === remaining.length - 1 ? 0 : account.badgeCount,
          }))
        : [createAccount()],
    );
  }

  private commit(accounts: Account[]): void {
    const next = accounts.map((account, accountIndex) => ({...account, accountIndex}));
    // A failed durable write must not publish a state that will vanish on restart.
    this.persist(structuredClone(next));
    this.accounts = next;
  }
}
