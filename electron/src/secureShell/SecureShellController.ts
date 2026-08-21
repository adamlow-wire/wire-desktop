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
import {ViewIdentityRegistry} from './ViewIdentityRegistry';

import {getLogger} from '../logging/getLogger';

const logger = getLogger(path.basename(__filename));

export interface SecureShellControllerOptions {
  readonly accountId: string;
  readonly accountUrl: string;
  readonly accountPreload: string;
  readonly allowHttpForTest?: boolean;
  readonly show?: boolean;
}

export class SecureShellController {
  private accountView: WebContentsView | undefined;
  private readonly accountUrl: URL;
  private readonly configuredSessions = new WeakSet<Session>();
  private readonly partition: string;
  private readonly registry: ViewIdentityRegistry;
  private readonly options: SecureShellControllerOptions;
  private window: BrowserWindow | undefined;

  constructor(options: SecureShellControllerOptions, registry: ViewIdentityRegistry) {
    this.options = options;
    this.registry = registry;
    this.accountUrl = parseSecureAccountUrl(options.accountUrl, options.allowHttpForTest);
    this.partition = createSecureAccountPartition(`${this.accountUrl.origin}\0${options.accountId}`);
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
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    window.on('resize', () => this.layoutAccountView());
    window.on('closed', () => this.disposeAccountView());

    await window.loadURL(`${SECURE_SHELL_ORIGIN}/index.html`);
    await this.createAccountView();

    if (this.options.show !== false) {
      window.show();
    }
  }

  show(): void {
    this.window?.show();
  }

  getAccountWebContentsForTest(): Electron.WebContents | undefined {
    return this.accountView?.webContents;
  }

  getWindowForTest(): BrowserWindow | undefined {
    return this.window;
  }

  dispose(): void {
    this.disposeAccountView();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = undefined;
  }

  private async createAccountView(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        partition: this.partition,
        preload: this.options.accountPreload,
        sandbox: true,
        webviewTag: false,
      },
    });
    const webContents = view.webContents;
    this.accountView = view;
    this.configureSession(webContents.session);
    this.registry.register({
      accountId: this.options.accountId,
      allowedOrigin: this.accountUrl.origin,
      capabilities: [SECURE_SHELL_RUNTIME_INFO_CAPABILITY],
      partition: this.partition,
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
      void this.recoverAccountView(view).catch(error => {
        logger.error('Secure account view recovery failed.', error);
        this.disposeAccountView();
      });
    });

    this.window.contentView.addChildView(view);
    this.layoutAccountView();
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

  private layoutAccountView(): void {
    if (!this.window || !this.accountView) {
      return;
    }

    const {height, width} = this.window.getContentBounds();
    this.accountView.setBounds({height, width, x: 0, y: 0});
  }

  private async recoverAccountView(failedView: WebContentsView): Promise<void> {
    if (this.accountView !== failedView || !this.window || this.window.isDestroyed()) {
      return;
    }

    this.disposeAccountView();
    await this.createAccountView();
  }

  private disposeAccountView(): void {
    const view = this.accountView;
    this.accountView = undefined;
    if (!view) {
      return;
    }

    this.registry.unregister(view.webContents.id);
    if (this.window && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }
}
