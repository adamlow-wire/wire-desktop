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

import {BrowserWindow, Event, Session, WebContentsView} from 'electron';

import * as path from 'path';

import {SECURE_SHELL_ORIGIN, SECURE_SHELL_RUNTIME_INFO_CAPABILITY} from './constants';
import {createSecureAccountPartition, isAllowedAccountNavigation, parseSecureAccountUrl} from './policy';

import {getLogger} from '../logging/getLogger';
import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

const logger = getLogger(path.basename(__filename));

export interface SecureShellControllerOptions {
  readonly accountId: string;
  readonly accountUrl: string;
  readonly accountPreload: string;
  readonly allowHttpForTest?: boolean;
  readonly show?: boolean;
}

export class SecureShellController {
  private activeAccountId: string | undefined;
  private readonly accountViews = new Map<string, WebContentsView>();
  private readonly accountUrl: URL;
  private readonly configuredSessions = new WeakSet<Session>();
  private readonly deletingAccountIds = new Set<string>();
  private readonly registry: ViewIdentityRegistry;
  private readonly options: SecureShellControllerOptions;
  private window: BrowserWindow | undefined;

  constructor(options: SecureShellControllerOptions, registry: ViewIdentityRegistry) {
    this.options = options;
    this.registry = registry;
    this.accountUrl = parseSecureAccountUrl(options.accountUrl, options.allowHttpForTest);
  }

  async start(): Promise<void> {
    if (this.window) {
      throw new Error('Secure shell is already running.');
    }

    const window = new BrowserWindow({
      height: 768,
      show: false,
      title: 'Wire secure shell proof',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        sandbox: true,
        webviewTag: false,
      },
      width: 1024,
    });
    this.window = window;
    const shellWebContents = window.webContents;
    const shellWebContentsId = shellWebContents.id;
    this.registry.register({
      allowedOrigin: SECURE_SHELL_ORIGIN,
      capabilities: [],
      partition: 'default',
      session: shellWebContents.session,
      viewType: 'application-shell',
      webContents: shellWebContents,
    });
    shellWebContents.once('destroyed', () => this.registry.unregister(shellWebContentsId));
    shellWebContents.once('render-process-gone', () => this.registry.unregister(shellWebContentsId));
    shellWebContents.on('will-navigate', event => event.preventDefault());
    shellWebContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.on('resize', () => this.layoutAccountViews());
    window.on('closed', () => this.disposeAccountViews());

    await window.loadURL(`${SECURE_SHELL_ORIGIN}/index.html`);
    await this.addAccount(this.options.accountId);

    if (this.options.show !== false) {
      window.show();
    }
  }

  show(): void {
    this.window?.show();
  }

  async addAccount(accountId: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Secure shell is not running.');
    }
    if (this.accountViews.has(accountId) || this.deletingAccountIds.has(accountId)) {
      throw new Error(`Secure account "${accountId}" already exists or is being deleted.`);
    }

    try {
      await this.createAccountView(accountId);
      this.switchAccount(accountId);
    } catch (error) {
      this.disposeAccountView(accountId);
      throw error;
    }
  }

  switchAccount(accountId: string): void {
    if (!this.accountViews.has(accountId)) {
      throw new Error(`Unknown secure account "${accountId}".`);
    }

    for (const [candidateId, view] of this.accountViews) {
      view.setVisible(candidateId === accountId);
    }
    this.activeAccountId = accountId;
  }

  removeAccount(accountId: string): void {
    if (!this.accountViews.has(accountId)) {
      throw new Error(`Unknown secure account "${accountId}".`);
    }

    const wasActive = this.activeAccountId === accountId;
    this.disposeAccountView(accountId);
    if (wasActive) {
      this.activeAccountId = undefined;
      const remainingIds = [...this.accountViews.keys()];
      const fallbackId = remainingIds[remainingIds.length - 1];
      if (fallbackId) {
        this.switchAccount(fallbackId);
      }
    }
  }

  async deleteAccount(accountId: string): Promise<void> {
    const view = this.accountViews.get(accountId);
    if (!view) {
      throw new Error(`Unknown secure account "${accountId}".`);
    }

    const accountSession = view.webContents.session;
    this.deletingAccountIds.add(accountId);
    this.removeAccount(accountId);
    try {
      await accountSession.clearStorageData();
      await accountSession.clearCache();
      accountSession.flushStorageData();
    } finally {
      this.deletingAccountIds.delete(accountId);
    }
  }

  getAccountIds(): readonly string[] {
    return Object.freeze([...this.accountViews.keys()]);
  }

  getActiveAccountId(): string | undefined {
    return this.activeAccountId;
  }

  getAccountWebContentsForTest(accountId = this.options.accountId): Electron.WebContents | undefined {
    return this.accountViews.get(accountId)?.webContents;
  }

  getWindowForTest(): BrowserWindow | undefined {
    return this.window;
  }

  dispose(): void {
    this.disposeAccountViews();
    if (this.window && !this.window.isDestroyed()) {
      this.registry.unregister(this.window.webContents.id);
      this.window.destroy();
    }
    this.window = undefined;
  }

  private async createAccountView(accountId: string): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      throw new Error('Secure shell is not running.');
    }

    const partition = createSecureAccountPartition(`${this.accountUrl.origin}\0${accountId}`);

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        partition,
        preload: this.options.accountPreload,
        sandbox: true,
        webviewTag: false,
      },
    });
    view.setVisible(false);
    const webContents = view.webContents;
    this.accountViews.set(accountId, view);
    this.configureSession(webContents.session);
    this.registry.register({
      accountId,
      allowedOrigin: this.accountUrl.origin,
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition,
      session: webContents.session,
      viewType: 'account',
      webContents,
    });

    const preventUnexpectedNavigation = (event: Event, url: string): void => {
      if (!isAllowedAccountNavigation(url, this.accountUrl.origin)) {
        event.preventDefault();
      }
    };
    webContents.on('will-navigate', preventUnexpectedNavigation);
    webContents.on('will-redirect', preventUnexpectedNavigation);
    webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    webContents.once('destroyed', () => this.registry.unregister(webContents.id));
    webContents.once('render-process-gone', () => {
      this.registry.unregister(webContents.id);
      void this.recoverAccountView(accountId, view).catch(error => {
        logger.error('Secure account view recovery failed.', error);
        if (this.accountViews.has(accountId)) {
          this.removeAccount(accountId);
        }
      });
    });

    this.window.contentView.addChildView(view);
    this.layoutAccountViews();
    await webContents.loadURL(this.accountUrl.href);
  }

  private configureSession(accountSession: Session): void {
    if (this.configuredSessions.has(accountSession)) {
      return;
    }
    this.configuredSessions.add(accountSession);
    accountSession.setPermissionCheckHandler(() => false);
    accountSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    accountSession.webRequest.onBeforeRequest((details, callback) => {
      const isNavigation = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame';
      callback({cancel: isNavigation && !isAllowedAccountNavigation(details.url, this.accountUrl.origin)});
    });
    accountSession.on('will-download', (event: Event) => event.preventDefault());
  }

  private layoutAccountViews(): void {
    if (!this.window) {
      return;
    }

    const {height, width} = this.window.getContentBounds();
    for (const view of this.accountViews.values()) {
      view.setBounds({height, width, x: 0, y: 0});
    }
  }

  private async recoverAccountView(accountId: string, failedView: WebContentsView): Promise<void> {
    if (this.accountViews.get(accountId) !== failedView || !this.window || this.window.isDestroyed()) {
      return;
    }

    const wasActive = this.activeAccountId === accountId;
    this.disposeAccountView(accountId);
    await this.createAccountView(accountId);
    if (wasActive) {
      this.switchAccount(accountId);
    }
  }

  private disposeAccountViews(): void {
    for (const accountId of [...this.accountViews.keys()]) {
      this.disposeAccountView(accountId);
    }
    this.activeAccountId = undefined;
  }

  private disposeAccountView(accountId: string): void {
    const view = this.accountViews.get(accountId);
    if (!view) {
      return;
    }
    this.accountViews.delete(accountId);

    this.registry.unregister(view.webContents.id);
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }
}
