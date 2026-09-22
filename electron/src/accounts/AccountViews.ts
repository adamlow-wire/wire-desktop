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

import {BrowserWindow, session, WebContents, WebContentsView} from 'electron';

import {ValidationUtil} from '@wireapp/commons';

import {loadAccountDestination} from './loadAccountDestination';

import type {Account} from '../../renderer/src/types/account';
import {EVENT_TYPE} from '../lib/eventType';
import {
  ACCOUNT_PERMISSION_CAPABILITY,
  type AccountPermissionConsent,
  AccountPermissionPolicy,
} from '../security/AccountPermissionPolicy';
import {bindAccountPermissionSession} from '../security/AccountPermissionSession';
import {bindNavigationGuard} from '../security/NavigationGuard';
import {isAllowedAccountNavigation, parseNetworkNavigation} from '../security/NavigationPolicy';
import {AuthorizedViewIdentity, registerViewIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

type AccountViewRecord = Pick<Account, 'id' | 'sessionID'>;

interface ViewEntry {
  view: WebContentsView;
  contents: WebContents;
  partition: string;
  identity: AuthorizedViewIdentity;
  ready: boolean;
  notificationRequested: boolean;
  cancelConsent(): void;
  revoke(): void;
}

interface ClosingView extends Pick<ViewEntry, 'partition' | 'contents' | 'revoke'> {
  detach(): void;
}

export interface AccountViewsOptions {
  window: BrowserWindow;
  registry: ViewIdentityRegistry;
  preload: string;
  additionalArguments: string[];
  capabilities: readonly string[];
  permissionConsent?: AccountPermissionConsent;
  permissionFailure?(): void;
  configure(contents: WebContents, account: AccountViewRecord, url: URL): Promise<void>;
  lost(accountId: string): void;
}

export class AccountViews {
  private readonly entries = new Map<string, ViewEntry>();
  private readonly closing = new Map<string, {partition: string; done: Promise<void>}>();
  private readonly failedClosures = new Map<string, ClosingView>();
  private sidebarWidth = 0;
  private headerHeight = 0;
  private disposed = false;

  constructor(private readonly options: AccountViewsOptions) {
    options.window.on('resize', this.layout);
    options.window.on('focus', this.requestNotifications);
    options.window.once('closed', this.onWindowClosed);
  }

  async create(account: AccountViewRecord, destination: string): Promise<WebContents> {
    const url = parseNetworkNavigation(destination);
    const partition = (account.sessionID ?? 'default').toLowerCase();
    if (
      this.disposed ||
      this.options.window.isDestroyed() ||
      this.entries.has(account.id) ||
      this.closing.has(account.id) ||
      this.failedClosures.has(account.id) ||
      [...this.entries.values(), ...this.closing.values(), ...this.failedClosures.values()].some(
        entry => entry.partition === partition,
      ) ||
      !ValidationUtil.isUUIDv4(account.id) ||
      (account.sessionID !== undefined && !ValidationUtil.isUUIDv4(account.sessionID)) ||
      !url
    ) {
      throw new Error('Account view cannot be created.');
    }
    // Query parameters are compatibility data, never the authority source.
    url.searchParams.set('id', account.id);
    const accountSession = account.sessionID
      ? session.fromPartition(`persist:${account.sessionID}`)
      : session.defaultSession;
    accountSession.setPermissionCheckHandler(() => false);
    accountSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    const view = new WebContentsView({
      webPreferences: {
        additionalArguments: [...this.options.additionalArguments],
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        preload: this.options.preload,
        sandbox: true,
        session: accountSession,
        webviewTag: false,
      },
    });
    const contents = view.webContents;
    try {
      view.setVisible(false);
      const registration = registerViewIdentity(this.options.registry, {
        accountId: account.id,
        allowedOrigin: url.origin,
        capabilities: this.options.capabilities,
        partition: account.sessionID ?? 'default',
        session: accountSession,
        viewType: 'account',
        webContents: contents,
      });
      const entry: ViewEntry = {
        view,
        contents,
        partition,
        identity: registration.identity,
        ready: false,
        notificationRequested: false,
        cancelConsent: () => undefined,
        revoke: registration.revoke,
      };
      this.entries.set(account.id, entry);
      contents.on('did-start-navigation', details => {
        if (details.isMainFrame && !details.isSameDocument) {
          entry.ready = false;
          entry.notificationRequested = false;
        }
      });
      bindNavigationGuard(contents, target => isAllowedAccountNavigation(target, url.origin));
      contents.setWindowOpenHandler(() => ({action: 'deny'}));
      contents.once('render-process-gone', () => {
        registration.revoke();
        if (this.entries.get(account.id)?.view === view) {
          void this.close(account.id)
            .then(() => this.options.lost(account.id))
            .catch(this.reportLifecycleFailure);
        }
      });
      const consent = this.options.permissionConsent;
      const permissions = new AccountPermissionPolicy(this.options.registry, registration.identity, {
        canPrompt: identity => view.getVisible() && consent?.canPrompt(identity) === true,
        ask: (identity, scopes, signal) => consent?.ask(identity, scopes, signal) ?? Promise.resolve(false),
      });
      const disposePermissions = bindAccountPermissionSession(
        accountSession,
        contents,
        permissions,
        this.options.permissionFailure ?? (() => console.error('Account permission request failed.')),
      );
      entry.cancelConsent = () => permissions.cancelPending();
      entry.revoke = () => {
        registration.revoke();
        disposePermissions();
      };
      await this.options.configure(contents, {...account}, new URL(url.href));
      if (this.disposed || this.entries.get(account.id)?.view !== view || contents.isDestroyed()) {
        throw new Error('Account view creation was cancelled.');
      }
      this.options.window.contentView.addChildView(view);
      this.layout();
      await loadAccountDestination(
        contents,
        url.href,
        () => !this.disposed && !this.options.window.isDestroyed() && this.entries.get(account.id)?.view === view,
      );
      return contents;
    } catch (error) {
      if (this.entries.get(account.id)?.view === view) {
        await this.close(account.id);
      } else if (!contents.isDestroyed()) {
        // Setup can fail before an entry exists; the allocated contents are still ours.
        await this.closeOwned(account.id, {
          partition,
          contents,
          revoke: () => undefined,
          detach: () => undefined,
        });
      }
      throw error;
    }
  }

  has(accountId: string): boolean {
    return !!this.entries.get(accountId) && !this.entries.get(accountId)!.contents.isDestroyed();
  }

  get(accountId: string): WebContents {
    const contents = this.entries.get(accountId)?.contents;
    if (!contents || contents.isDestroyed()) {
      throw new Error('Unknown account view.');
    }
    return contents;
  }

  select(accountId: string): void {
    const contents = this.get(accountId);
    for (const [id, entry] of this.entries) {
      if (id !== accountId) {
        entry.cancelConsent();
      }
      entry.view.setVisible(id === accountId);
    }
    this.options.window.focus();
    contents.focus();
    this.requestNotifications();
  }

  markReady(accountId: string): void {
    this.get(accountId);
    this.entries.get(accountId)!.ready = true;
    this.requestNotifications();
  }

  private readonly requestNotifications = (): void => {
    if (
      this.disposed ||
      this.options.window.isDestroyed() ||
      !this.options.capabilities.includes(ACCOUNT_PERMISSION_CAPABILITY)
    ) {
      return;
    }
    for (const entry of this.entries.values()) {
      if (
        entry.ready &&
        !entry.notificationRequested &&
        entry.view.getVisible() &&
        !entry.contents.isDestroyed() &&
        this.options.permissionConsent?.canPrompt(entry.identity) === true
      ) {
        entry.notificationRequested = true;
        entry.contents.send(EVENT_TYPE.ACTION.REQUEST_NOTIFICATION_PERMISSION);
      }
    }
  };

  hide(): void {
    for (const entry of this.entries.values()) {
      entry.cancelConsent();
      entry.view.setVisible(false);
    }
  }

  setChrome(sidebarWidth: number, headerHeight: number): void {
    if (
      !Number.isSafeInteger(sidebarWidth) ||
      sidebarWidth < 0 ||
      sidebarWidth > 240 ||
      !Number.isSafeInteger(headerHeight) ||
      headerHeight < 0 ||
      headerHeight > 120
    ) {
      throw new Error('Invalid account chrome dimensions.');
    }
    this.sidebarWidth = sidebarWidth;
    this.headerHeight = headerHeight;
    this.layout();
  }

  async close(accountId: string): Promise<void> {
    const pending = this.closing.get(accountId);
    if (pending) {
      return pending.done;
    }
    const entry = this.entries.get(accountId);
    const owned = entry
      ? {
          partition: entry.partition,
          contents: entry.contents,
          revoke: entry.revoke,
          detach: () => {
            if (!this.options.window.isDestroyed()) {
              this.options.window.contentView.removeChildView(entry.view);
            }
          },
        }
      : this.failedClosures.get(accountId);
    if (!owned) {
      return;
    }
    this.entries.delete(accountId);
    return this.closeOwned(accountId, owned);
  }

  private closeOwned(accountId: string, owned: ClosingView): Promise<void> {
    const pending = this.closing.get(accountId);
    if (pending) {
      return pending.done;
    }
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<void>((complete, fail) => {
      resolve = complete;
      reject = fail;
    });
    // Reserve before any cleanup callback can re-enter this owner.
    this.closing.set(accountId, {partition: owned.partition, done});
    void this.destroyOwned(owned).then(
      () => {
        this.failedClosures.delete(accountId);
        this.closing.delete(accountId);
        resolve();
      },
      error => {
        // Keep failed cleanup private and retryable; it must never become a usable view.
        this.failedClosures.set(accountId, owned);
        this.closing.delete(accountId);
        reject(error);
      },
    );
    return done;
  }

  private async destroyOwned(owned: ClosingView): Promise<void> {
    let failed = false;
    let failure: unknown;
    const recordFailure = (error: unknown) => {
      if (!failed) {
        failed = true;
        failure = error;
      }
    };
    try {
      owned.revoke();
    } catch (error) {
      recordFailure(error);
    }
    try {
      owned.detach();
    } catch (error) {
      recordFailure(error);
    }
    const contents = owned.contents;
    if (!contents.isDestroyed()) {
      let complete!: () => void;
      const destroyed = new Promise<void>(resolve => {
        complete = resolve;
      });
      contents.once('destroyed', complete);
      try {
        contents.close({waitForBeforeUnload: false});
        await destroyed;
      } catch (error) {
        recordFailure(error);
      } finally {
        contents.removeListener('destroyed', complete);
      }
    }
    if (failed) {
      throw failure;
    }
  }

  private readonly reportLifecycleFailure = (): void => {
    try {
      console.error('Account view lifecycle cleanup failed.');
    } catch {
      // Diagnostics cannot create another unhandled lifecycle rejection.
    }
  };

  private readonly onWindowClosed = (): void => {
    void this.dispose().catch(this.reportLifecycleFailure);
  };

  readonly dispose = async (): Promise<void> => {
    this.disposed = true;
    this.options.window.removeListener('resize', this.layout);
    this.options.window.removeListener('focus', this.requestNotifications);
    this.options.window.removeListener('closed', this.onWindowClosed);
    await Promise.all([
      ...[...new Set([...this.entries.keys(), ...this.failedClosures.keys()])].map(id => this.close(id)),
      ...[...this.closing.values()].map(entry => entry.done),
    ]);
  };

  private readonly layout = (): void => {
    if (this.options.window.isDestroyed()) {
      return;
    }
    const {width, height} = this.options.window.getContentBounds();
    const left = Math.min(this.sidebarWidth, width);
    const top = Math.min(this.headerHeight, height);
    for (const {view} of this.entries.values()) {
      view.setBounds({x: left, y: top, width: Math.max(0, width - left), height: Math.max(0, height - top)});
    }
  };
}
