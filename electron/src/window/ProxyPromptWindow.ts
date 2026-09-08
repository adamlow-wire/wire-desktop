/*
 * Wire
 * Copyright (C) 2019 Wire Swiss GmbH
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

import {app, BrowserWindow, session} from 'electron';

import * as path from 'path';
import {pathToFileURL} from 'url';

import {EVENT_TYPE} from '../lib/eventType';
import {bindNavigationGuard} from '../security/NavigationGuard';
import {
  PROXY_PROMPT_CANCEL_CAPABILITY,
  PROXY_PROMPT_LOCALE_READ_CAPABILITY,
  PROXY_PROMPT_SUBMIT_CAPABILITY,
} from '../security/ProxyPromptContract';
import {registerViewIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';
import {config} from '../settings/config';

const appPath = path.join(app.getAppPath(), config.electronDirectory);

const promptHtmlPath = pathToFileURL(path.join(appPath, 'html/proxy-prompt.html')).href;
const proxyPromptWindowAllowList = [promptHtmlPath, pathToFileURL(path.join(appPath, 'css/proxy-prompt.css')).href];
const preloadPath = path.join(appPath, 'dist/preload/menu/preload-proxy-prompt.js');

const windowSize = {
  HEIGHT: 350,
  WIDTH: 550,
};

type OnProxyPromptCreated = (webContentsId: number) => (() => void) | undefined;

const showWindow = async (registry: ViewIdentityRegistry, onCreated?: OnProxyPromptCreated): Promise<BrowserWindow> => {
  let proxyPromptWindow: BrowserWindow | undefined;

  if (!proxyPromptWindow) {
    proxyPromptWindow = new BrowserWindow({
      alwaysOnTop: true,
      backgroundColor: '#ececec',
      fullscreen: false,
      height: windowSize.HEIGHT,
      maximizable: false,
      minimizable: false,
      resizable: false,
      show: false,
      title: config.name,
      webPreferences: {
        contextIsolation: true,
        javascript: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        preload: preloadPath,
        sandbox: true,
        session: session.fromPartition('proxy-prompt-window'),
        spellcheck: false,
        webviewTag: false,
      },
      width: windowSize.WIDTH,
    });
    registerViewIdentity(registry, {
      allowedOrigin: new URL(promptHtmlPath).origin,
      allowedUrl: promptHtmlPath,
      capabilities: [
        PROXY_PROMPT_LOCALE_READ_CAPABILITY,
        PROXY_PROMPT_SUBMIT_CAPABILITY,
        PROXY_PROMPT_CANCEL_CAPABILITY,
      ],
      partition: 'proxy-prompt-window',
      session: proxyPromptWindow.webContents.session,
      viewType: 'proxy-prompt',
      webContents: proxyPromptWindow.webContents,
    });
    proxyPromptWindow.setMenuBarVisibility(false);

    bindNavigationGuard(proxyPromptWindow.webContents, url => url === promptHtmlPath);
    proxyPromptWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    proxyPromptWindow.webContents.session.webRequest.onBeforeRequest(({url}, callback) => {
      callback({cancel: !proxyPromptWindowAllowList.includes(url)});
    });

    const onClosed = onCreated?.(proxyPromptWindow.webContents.id);
    proxyPromptWindow.on('closed', () => {
      onClosed?.();
      proxyPromptWindow = undefined;
    });

    await proxyPromptWindow.loadURL(promptHtmlPath);

    if (proxyPromptWindow) {
      proxyPromptWindow.webContents.send(EVENT_TYPE.PROXY_PROMPT.LOADED);
    }
  }

  proxyPromptWindow.show();
  return proxyPromptWindow;
};

export const ProxyPromptWindow = {showWindow};
