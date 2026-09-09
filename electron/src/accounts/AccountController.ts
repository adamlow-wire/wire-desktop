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

import {Session, WebContents} from 'electron';

import {Availability} from '@wireapp/protocol-messaging';
import {WebAppEvents} from '@wireapp/webapp-events';

import {AccountState, AccountSnapshot} from './AccountState';
import {AccountViews} from './AccountViews';

import type {Account, ConversationJoinData} from '../../renderer/src/types/account';
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
  menu(account: Account): Promise<void>;
}

// Serializes account lifecycle effects. Authority is checked again when queued work actually begins.
export class AccountController {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly failures = new Set<string>();
  private readonly menuQueue = new Map<string, string[]>();
  private readonly ready = new Set<string>();

  constructor(private readonly options: AccountControllerOptions) {}

  snapshots = (): readonly AccountSnapshot[] =>
    this.options.state.snapshots().map(account =>
      Object.freeze({
        ...account,
        isLoading:
          !this.failures.has(account.id) &&
          (!this.options.views.has(account.id) || this.options.views.get(account.id).isLoading()),
        loadError: this.failures.has(account.id) ? 'Account loading failed.' : undefined,
      }),
    );

  start(): Promise<void> {
    return this.run(async () => {
      await Promise.allSettled(this.snapshots().map(account => this.ensureView(account.id)));
      const selected = this.snapshots().find(account => account.visible)!.id;
      if (this.options.views.has(selected)) {
        this.options.views.select(selected);
      } else {
        this.options.views.hide();
      }
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
      this.options.state.select(id);
      this.options.views.hide();
      await this.ensureView(id);
      this.options.views.select(id);
      this.publishBadge(id);
    }, identity);

  remove = (id: string, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(() => this.removeAccount(id), identity);

  // Called only by main-owned desktop controls, not by an IPC binder.
  desktopAction = async (channel: string, args: readonly unknown[]): Promise<void> => {
    if (channel === EVENT_TYPE.UI.SYSTEM_MENU && args.length === 1 && typeof args[0] === 'string') {
      return this.menuAction(args[0]);
    }
    if (channel === EVENT_TYPE.ACTION.SWITCH_ACCOUNT && args.length === 1 && Number.isInteger(args[0])) {
      const account = this.snapshots().find(record => record.accountIndex === args[0]);
      if (!account) {
        throw new Error('Unknown account shortcut index.');
      }
      return this.select(account.id);
    }
    const edits: Record<string, keyof Pick<WebContents, 'copy' | 'cut' | 'paste' | 'redo' | 'selectAll' | 'undo'>> = {
      [EVENT_TYPE.EDIT.COPY]: 'copy',
      [EVENT_TYPE.EDIT.CUT]: 'cut',
      [EVENT_TYPE.EDIT.PASTE]: 'paste',
      [EVENT_TYPE.EDIT.REDO]: 'redo',
      [EVENT_TYPE.EDIT.SELECT_ALL]: 'selectAll',
      [EVENT_TYPE.EDIT.UNDO]: 'undo',
    };
    if (Object.hasOwn(edits, channel) && args.length === 0) {
      const id = this.snapshots().find(account => account.visible)!.id;
      return this.run(async () => {
        this.options.state.get(id);
        this.options.views.get(id)[edits[channel]]();
      });
    }
    throw new Error('Invalid desktop action.');
  };

  // Main-owned menu commands only; never exposed as a renderer-selected IPC channel.
  menuAction = (action: string): Promise<void> => {
    const allowed: string[] = [
      ...Object.values(EVENT_TYPE.CONVERSATION),
      EVENT_TYPE.PREFERENCES.SHOW,
      EVENT_TYPE.ACTION.SIGN_OUT,
    ];
    if (!allowed.includes(action)) {
      return Promise.reject(new Error('Unknown desktop menu action.'));
    }
    const id = this.snapshots().find(account => account.visible)!.id;
    return this.run(async () => {
      this.options.state.get(id);
      if (this.ready.has(id) && this.options.views.has(id)) {
        this.options.views.get(id).send(action);
        return;
      }
      const queued = this.menuQueue.get(id) ?? [];
      if (queued.length >= 32) {
        throw new Error('Account menu queue is full.');
      }
      queued.push(action);
      this.menuQueue.set(id, queued);
    });
  };

  join = (id: string, data: ConversationJoinData, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(async () => {
      this.options.state.update(id, {type: 'join', ...data});
      this.deliverJoin(id);
    }, identity);

  private deliverJoin(id: string): void {
    const account = this.options.state.get(id);
    if (account.lifecycle === EVENT_TYPE.LIFECYCLE.SIGNED_IN && account.conversationJoinData) {
      this.options.views.get(id).send(WebAppEvents.CONVERSATION.JOIN, account.conversationJoinData);
      this.options.state.clearPendingJoin(id);
    }
  }

  reload = (id: string, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(async () => {
      this.options.state.get(id);
      this.resetMenu(id);
      await this.options.views.close(id);
      await this.ensureView(id);
      this.options.views.select(this.snapshots().find(account => account.visible)!.id);
    }, identity);

  logout = (id: string, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(async () => {
      this.options.state.select(id);
      this.options.views.select(id);
      this.publishBadge(id);
      this.options.views.get(id).send(EVENT_TYPE.ACTION.SIGN_OUT);
    }, identity);

  layout = (sidebarWidth: number, headerHeight: number, identity?: AuthorizedViewIdentity): Promise<void> =>
    this.run(async () => this.options.views.setChrome(sidebarWidth, headerHeight), identity);

  contextMenu = async (id: string, identity?: AuthorizedViewIdentity): Promise<void> => {
    let closed: Promise<void> | undefined;
    await this.run(async () => {
      closed = this.options.menu(this.options.state.get(id));
    }, identity);
    // Do not stall guest events while the user is interacting with a native menu.
    await closed;
  };

  receive = (identity: AuthorizedViewIdentity, event: AccountEvent): Promise<void> => {
    const message = structuredClone(event);
    return this.run(
      async () => {
        const id = identity.accountId!;
        const {state, views} = this.options;
        state.get(id);
        if (message.type === 'signed-out') {
          this.resetMenu(id);
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
          this.deliverJoin(id);
        }
        if (message.type === 'loaded') {
          this.ready.add(id);
          const queued = this.menuQueue.get(id) ?? [];
          this.menuQueue.delete(id);
          queued.forEach(action => views.get(id).send(action));
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
      this.failures.delete(id);
      try {
        await this.options.views.create(account, this.options.destination(account));
      } catch (error) {
        this.failures.add(id);
        throw error;
      }
    }
  }

  private async removeAccount(id: string): Promise<void> {
    const account = this.options.state.get(id);
    this.resetMenu(id);
    const session = this.options.views.has(id) ? this.options.views.get(id).session : this.options.session(account);
    await this.options.views.close(id);
    await this.options.clearData(account, session);
    this.options.state.remove(id);
    this.failures.delete(id);
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
    this.resetMenu(id);
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

  private resetMenu(id: string): void {
    this.ready.delete(id);
    this.menuQueue.delete(id);
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
      try {
        await operation();
      } finally {
        this.options.changed(this.snapshots());
      }
    });
    this.pending = task.catch(() => undefined);
    return task;
  }
}
