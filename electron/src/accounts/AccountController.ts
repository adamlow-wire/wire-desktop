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

import {Availability} from '@wireapp/protocol-messaging';
import {WebAppEvents} from '@wireapp/webapp-events';

import {AccountState, AccountSnapshot} from './AccountState';
import {AccountViews} from './AccountViews';

import type {Account} from '../../renderer/src/types/account';
import {EVENT_TYPE} from '../lib/eventType';
import {ACCOUNT_CONTROL_CAPABILITY} from '../security/AccountControlContract';
import {ACCOUNT_EVENT_CAPABILITY, AccountEvent} from '../security/AccountEventContract';
import {isAllowedAccountNavigation, parseNetworkNavigation} from '../security/NavigationPolicy';
import {AuthorizedViewIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

export interface AccountControllerOptions {
  state: AccountState;
  views: AccountViews;
  registry: ViewIdentityRegistry;
  destination(account: Account): string;
  session(account: Account): Session;
  clearData(account: Account, session: Session): Promise<void>;
  approveEnvironment(account: Account, destination: string): Promise<string>;
  changed(accounts: readonly AccountSnapshot[]): void;
  badge(count: number, ignoreFlash: boolean): void;
  loaded(accountId: string): void;
}

// Serializes account lifecycle effects. Authority is checked again when queued work actually begins.
export class AccountController {
  private pending: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: AccountControllerOptions) {}

  snapshots = (): readonly AccountSnapshot[] => this.options.state.snapshots();

  start(): Promise<void> {
    return this.run(async () => {
      for (const account of this.snapshots()) {
        await this.ensureView(account.id);
      }
      this.options.views.select(this.snapshots().find(account => account.visible)!.id);
    });
  }

  add = (identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(async () => {
      const id = this.options.state.add();
      await this.ensureView(id);
      this.options.views.select(id);
      this.publishBadge(id);
    }, identity);

  select = (id: string, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(async () => {
      await this.ensureView(id);
      this.options.state.select(id);
      this.options.views.select(id);
      this.publishBadge(id);
    }, identity);

  remove = (id: string, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(() => this.removeAccount(id), identity);

  receive = (identity: AuthorizedViewIdentity, event: AccountEvent): Promise<void> => {
    const message = structuredClone(event);
    return this.run(
      async () => {
        const id = identity.accountId!;
        const {state, views} = this.options;
        state.get(id);
        if (message.type === 'signed-out') {
          if (message.clearData) {
            await this.removeAccount(id);
          } else {
            state.resetIdentity(id);
          }
          return;
        }
        if (message.type === 'environment') {
          await this.changeEnvironment(id, message.url, identity);
          return;
        }
        // Metadata cannot bypass the explicit environment-change policy.
        if (message.type === 'metadata' && message.data.webappUrl) {
          const approvedOrigin = parseNetworkNavigation(this.options.destination(state.get(id)))?.origin;
          if (!isAllowedAccountNavigation(message.data.webappUrl, approvedOrigin)) {
            throw new Error('Metadata cannot change an account destination.');
          }
        }
        state.update(id, message);
        if (message.type === 'activate') {
          views.select(id);
          this.publishBadge(id);
        }
        if (message.type === 'join' || message.type === 'loaded') {
          const account = state.get(id);
          if (account.lifecycle === EVENT_TYPE.LIFECYCLE.SIGNED_IN && account.conversationJoinData) {
            views.get(id).send(WebAppEvents.CONVERSATION.JOIN, account.conversationJoinData);
            state.clearPendingJoin(id);
          }
        }
        if (message.type === 'loaded') {
          this.options.loaded(id);
        }
        if (message.type === 'unread') {
          this.publishBadge(id);
        }
      },
      identity,
      ACCOUNT_EVENT_CAPABILITY,
    );
  };

  private async ensureView(id: string): Promise<void> {
    const account = this.options.state.get(id);
    if (!this.options.views.has(id)) {
      await this.options.views.create(account, this.options.destination(account));
    }
  }

  private async removeAccount(id: string): Promise<void> {
    const account = this.options.state.get(id);
    const session = this.options.views.has(id) ? this.options.views.get(id).session : this.options.session(account);
    await this.options.views.close(id);
    await this.options.clearData(account, session);
    this.options.state.remove(id);
    const selected = this.snapshots().find(record => record.visible)!;
    await this.ensureView(selected.id);
    this.options.views.select(selected.id);
    this.publishBadge(selected.id);
  }

  private async changeEnvironment(id: string, candidate: string, identity: AuthorizedViewIdentity): Promise<void> {
    const account = this.options.state.get(id);
    if (!parseNetworkNavigation(candidate)) {
      throw new Error('Invalid account destination.');
    }
    const approved = await this.options.approveEnvironment(account, candidate);
    this.assertIdentity(identity, ACCOUNT_EVENT_CAPABILITY);
    if (!parseNetworkNavigation(approved)) {
      throw new Error('Invalid approved account destination.');
    }
    await this.options.views.close(id);
    this.options.state.setEnvironment(id, approved);
    await this.ensureView(id);
    const selected = this.snapshots().find(record => record.visible)!;
    this.options.views.select(selected.id);
  }

  private publishBadge(id: string): void {
    this.options.badge(
      this.snapshots().reduce((sum, account) => sum + account.badgeCount, 0),
      this.options.state.get(id).availability === Availability.Type.BUSY,
    );
  }

  private assertIdentity(identity: AuthorizedViewIdentity, capability: string): void {
    const current = this.options.registry.authorize(
      {
        sender: identity.webContents,
        senderFrame: identity.mainFrame,
      },
      capability,
    );
    if (current !== identity) {
      throw new Error('Account operation has stale authority.');
    }
  }

  private run(
    operation: () => Promise<void>,
    identity?: AuthorizedViewIdentity,
    capability = ACCOUNT_CONTROL_CAPABILITY,
  ): Promise<void> {
    const task = this.pending.then(async () => {
      if (identity) {
        this.assertIdentity(identity, capability);
      }
      await operation();
      this.options.changed(this.snapshots());
    });
    this.pending = task.catch(() => undefined);
    return task;
  }
}
