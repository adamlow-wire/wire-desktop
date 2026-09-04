/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
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
import * as EnvironmentUtil from '../runtime/EnvironmentUtil';
import {ABOUT_LOCALE_READ_CAPABILITY, WebappVersions} from '../security/AboutWindowContract';
import {registerViewIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';
import {config} from '../settings/config';
import {WindowManager} from '../window/WindowManager';
import * as WindowUtil from '../window/WindowUtil';

let cachedWebappVersions: WebappVersions = {webappVersion: ''};
let aboutWindow: BrowserWindow | undefined;
let aboutWindowRegistry: ViewIdentityRegistry | undefined;
const pendingVersionRequests = new Set<(versions: WebappVersions) => void>();

const VERSION_REQUEST_TIMEOUT_MS = 1500;

// Paths
const APP_PATH = path.join(app.getAppPath(), config.electronDirectory);
const iconFileName = `logo.${EnvironmentUtil.platform.IS_WINDOWS ? 'ico' : 'png'}`;
const iconPath = path.join(APP_PATH, 'img', iconFileName);

// Local files
const ABOUT_HTML = pathToFileURL(path.join(APP_PATH, 'html/about.html')).href;
const ABOUT_WINDOW_ALLOWLIST = [
  ABOUT_HTML,
  pathToFileURL(path.join(APP_PATH, 'img/logo.256.png')).href,
  pathToFileURL(path.join(APP_PATH, 'css/about.css')).href,
];
const PRELOAD_JS = path.join(APP_PATH, 'dist/preload/menu/preload-about.js');

const WINDOW_SIZE = {
  HEIGHT: 256,
  WIDTH: 304,
};

function getCachedWebappVersions(): WebappVersions {
  return {
    webappAVSVersion: cachedWebappVersions.webappAVSVersion,
    webappVersion: cachedWebappVersions.webappVersion,
  };
}

export function acceptWebappVersions(versions: WebappVersions): void {
  cachedWebappVersions = {...versions};
  for (const resolve of [...pendingVersionRequests]) {
    resolve(getCachedWebappVersions());
  }
}

export function requestActiveWebappVersions(timeoutMilliseconds = VERSION_REQUEST_TIMEOUT_MS): Promise<WebappVersions> {
  const primaryWindow = WindowManager.getPrimaryWindow();

  if (primaryWindow === undefined) {
    return Promise.resolve(getCachedWebappVersions());
  }

  return new Promise(resolve => {
    const resolveRequest = (versions: WebappVersions): void => {
      clearTimeout(timeoutId);
      pendingVersionRequests.delete(resolveRequest);
      resolve(versions);
    };
    const timeoutId = setTimeout(() => resolveRequest(getCachedWebappVersions()), timeoutMilliseconds);
    pendingVersionRequests.add(resolveRequest);
    primaryWindow.webContents.send(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION);
  });
}

function renderAboutWindow(activeWebappVersions: WebappVersions): void {
  if (aboutWindow === undefined) {
    return;
  }

  aboutWindow.webContents.send(EVENT_TYPE.ABOUT.LOADED, {
    copyright: config.copyright,
    electronVersion: config.version,
    productName: config.name,
    webappVersion: activeWebappVersions.webappVersion,
    webappAVSVersion: activeWebappVersions.webappAVSVersion,
  });
}

const showWindow = async (registry: ViewIdentityRegistry): Promise<BrowserWindow> => {
  // let aboutWindow: BrowserWindow | undefined;
  const activeWebappVersions = await requestActiveWebappVersions();

  if (aboutWindow === undefined) {
    aboutWindow = new BrowserWindow({
      alwaysOnTop: false,
      backgroundColor: '#ececec',
      fullscreen: false,
      height: WINDOW_SIZE.HEIGHT,
      icon: iconPath,
      maximizable: false,
      minimizable: false,
      resizable: false,
      show: false,
      title: config.name,
      webPreferences: {
        contextIsolation: true,
        javascript: false,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        preload: PRELOAD_JS,
        sandbox: false,
        session: session.fromPartition('about-window'),
        spellcheck: false,
        webviewTag: false,
      },
      width: WINDOW_SIZE.WIDTH,
    });
    registerViewIdentity(registry, {
      allowedOrigin: new URL(ABOUT_HTML).origin,
      allowedUrl: ABOUT_HTML,
      capabilities: [ABOUT_LOCALE_READ_CAPABILITY],
      partition: 'about-window',
      session: aboutWindow.webContents.session,
      viewType: 'about',
      webContents: aboutWindow.webContents,
    });
    aboutWindowRegistry = registry;
    aboutWindow.setMenuBarVisibility(false);

    // Prevent any kind of navigation
    // will-navigate is broken with sandboxed env, intercepting requests instead
    // see https://github.com/electron/electron/issues/8841
    aboutWindow.webContents.session.webRequest.onBeforeRequest(async ({url}, callback) => {
      // Only allow those URLs to be opened within the window
      if (ABOUT_WINDOW_ALLOWLIST.includes(url)) {
        return callback({cancel: false});
      }
    });

    // Handle the new window event in the About Window
    aboutWindow.webContents.setWindowOpenHandler(details => {
      void WindowUtil.openExternal(details.url, true);
      return {action: 'deny'};
    });

    // Close window via escape
    aboutWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') {
        return;
      }

      if (input.key !== 'Escape') {
        return;
      }

      if (aboutWindow !== undefined) {
        aboutWindow.close();
      }
    });

    aboutWindow.on('closed', () => {
      aboutWindow = undefined;
      aboutWindowRegistry = undefined;
    });

    await aboutWindow.loadURL(ABOUT_HTML);
  }

  if (aboutWindowRegistry !== registry) {
    throw new Error('About window belongs to a different view identity registry.');
  }

  renderAboutWindow(activeWebappVersions);
  aboutWindow.show();
  return aboutWindow;
};

export const AboutWindow = {showWindow};
