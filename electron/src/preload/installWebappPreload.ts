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

import {contextBridge, ipcRenderer, webFrame} from 'electron';
import type {Data as OpenGraphResult} from 'open-graph';

import {ACCOUNT_THEME_CHANNEL} from './AccountThemeContract';
import {createWebappBridge, exposeWebappBridge} from './WebappBridge';
import {WebappVersions} from './WebappEventBridge';
import {createWebappMainWorld} from './WebappMainWorld';
import {createWebappPreloadEvents} from './WebappPreloadEvents';

import {createDesktopAppConfig} from '../lib/desktopAppConfig';
import type {ManagedConfig} from '../managed/ManagedConfig';
import {restoreRendererEnvironment} from '../runtime/rendererEnvironment';
import {readRendererEnvironment} from '../runtime/rendererRuntimeArguments';
import {reportWebappVersions as submitWebappVersions} from '../security/AboutWindowIpc';
import {requestDesktopSources} from '../security/DesktopSourcesIpc';
import {requestDownloadLocationUpdate} from '../security/DownloadLocationIpc';
import {MANAGED_CONFIG_CHANNEL} from '../security/ManagedConfigContract';
import {requestNotificationActivation} from '../security/NotificationActivationIpc';
import {requestOpenGraphData} from '../security/OpenGraphIpc';
import {SAFE_STORAGE_DECRYPT_CHANNEL, SAFE_STORAGE_ENCRYPT_CHANNEL} from '../security/SafeStorageContract';
import {requestSsoWindowClose, requestSsoWindowFocus} from '../security/SsoWindowControlIpc';
import {handleWebAppLoaded} from '../security/WebAppLoadedIpc';
import {requestWrapperRelaunch} from '../security/WrapperRelaunchIpc';
import {requestWrapperReload} from '../security/WrapperReloadIpc';

export const installWebappPreload = (
  sendAccountEvent?: (event: unknown) => void,
  startupConfig?: ManagedConfig,
): void => {
  const logger = console;
  const environment = restoreRendererEnvironment(readRendererEnvironment());
  const mainWorld = createWebappMainWorld(contextBridge);

  webFrame.setZoomFactor(1.0);
  webFrame.setVisualZoomLevelLimits(1, 1);

  function getOpenGraphDataViaChannel(url: string): Promise<OpenGraphResult> {
    return requestOpenGraphData(ipcRenderer, url);
  }

  function reportWebappVersion({webappAVSVersion, webappVersion}: WebappVersions): void {
    void submitWebappVersions(
      ipcRenderer,
      {
        webappVersion,
        ...(webappAVSVersion ? {webappAVSVersion} : {}),
      },
      logger,
    );
  }

  const preloadEvents = createWebappPreloadEvents({
    actions: {
      activateNotification: () => void requestNotificationActivation(ipcRenderer, logger),
      closeSsoWindow: () => void requestSsoWindowClose(ipcRenderer, logger),
      focusSsoWindow: () => void requestSsoWindowFocus(ipcRenderer, logger),
      loaded: markThemeLoaded =>
        sendAccountEvent ? markThemeLoaded() : handleWebAppLoaded(ipcRenderer, logger, markThemeLoaded),
      relaunch: () => void requestWrapperRelaunch(ipcRenderer, logger),
      reload: () => void requestWrapperReload(ipcRenderer, logger),
      reportVersions: reportWebappVersion,
      updateDownloadPath: downloadPath => void requestDownloadLocationUpdate(ipcRenderer, logger, downloadPath),
    },
    ipc: ipcRenderer,
    logger,
    mainWorld,
    sendAccountEvent,
  });

  ipcRenderer.on(ACCOUNT_THEME_CHANNEL, (_event, useDarkMode: unknown) => preloadEvents.receiveTheme(useDarkMode));

  /* istanbul ignore next -- the real-Electron compatibility suite exercises this preload composition root. */
  const initializeWebappBridge = (): void => {
    // Native views use main-owned bootstrap: their first preload can run before a committed origin.
    // Retain synchronous configuration only for the legacy preload entry.
    let managedConfig: ManagedConfig = startupConfig ?? {applockOverride: false};
    if (!startupConfig) {
      try {
        managedConfig = ipcRenderer.sendSync(MANAGED_CONFIG_CHANNEL) ?? {applockOverride: false};
      } catch (error) {
        logger.warn('Failed to read managed config from the main process, treating the device as unmanaged:', error);
        managedConfig = {applockOverride: false};
      }
    }

    const webappBridge = createWebappBridge({
      decrypt: encrypted => ipcRenderer.invoke(SAFE_STORAGE_DECRYPT_CHANNEL, encrypted),
      desktopAppConfig: createDesktopAppConfig(environment.app.DESKTOP_VERSION, managedConfig),
      encrypt: value => ipcRenderer.invoke(SAFE_STORAGE_ENCRYPT_CHANNEL, value),
      environment,
      events: preloadEvents.events,
      getDesktopSources: options => requestDesktopSources(ipcRenderer, options),
      getOpenGraphData: getOpenGraphDataViaChannel,
    });
    exposeWebappBridge(contextBridge, webappBridge);
  };

  /* istanbul ignore next -- executed and asserted by LegacyPreloadCompatibility.test.main.ts. */
  initializeWebappBridge();
  mainWorld.install();
  preloadEvents.subscribeToMainProcessEvents();

  window.addEventListener('DOMContentLoaded', async () => {
    // include context menu
    await import(/* webpackMode: "eager" */ './menu/preload-context');
  });
};
