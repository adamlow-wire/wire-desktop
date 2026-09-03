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

import {URL} from 'url';

import * as ProxyAuth from './ProxyAuth';
import {ProxyPromptActions} from './ProxyPromptCoordinator';

interface MainWindowBoundary<WebContents> {
  readonly webContents: WebContents;
  reload(): void;
}

interface ProxySessionBoundary {
  setProxy(config: object): Promise<void>;
}

interface ProxyPromptLogger {
  error(message: string, error: unknown): void;
  log(message: string): void;
}

export interface CreateProxyPromptActionsOptions<WebContents = unknown> {
  applyProxySettings(proxy: URL, webContents: WebContents): Promise<void>;
  authenticate(username: string, password: string): void;
  authInfo: Readonly<{host: string; port: number}>;
  challengedSession: ProxySessionBoundary;
  getProxyInfo(): URL | undefined;
  logger: ProxyPromptLogger;
  mainWindow: MainWindowBoundary<WebContents>;
  setProxyInfo(proxy: URL): void;
  showErrorDialog(message: string): void;
}

export const createProxyPromptActions = <WebContents>(
  options: CreateProxyPromptActionsOptions<WebContents>,
): ProxyPromptActions => ({
  async submit(promptData) {
    options.logger.log('Proxy info was submitted via prompt');
    const {username, password} = promptData;
    const protocol = options.getProxyInfo()?.protocol?.replace(':', '');
    const proxy = ProxyAuth.generateProxyURL(options.authInfo, {...promptData, protocol});
    options.setProxyInfo(proxy);

    options.logger.log('Proxy prompt was submitted, applying proxy settings on the main window...');
    await options.applyProxySettings(proxy, options.mainWindow.webContents);
    options.authenticate(username, password);
  },
  async cancel() {
    options.logger.log('Proxy prompt was canceled');
    // TODO: check if we should use `mode: 'auto_detect'` here
    await options.challengedSession.setProxy({});

    try {
      options.mainWindow.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.showErrorDialog(`Could not reload the window: ${message}`);
      options.logger.error('Could not reload the window:', error);
    }
  },
});
