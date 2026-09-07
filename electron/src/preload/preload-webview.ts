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

/* istanbul ignore file -- this preload runs in a separate renderer; LegacyPreloadCompatibility covers its wiring. */

import {contextBridge, ipcRenderer, webFrame} from 'electron';
import type {Data as OpenGraphResult} from 'open-graph';

import * as path from 'path';

import {WebAppEvents} from '@wireapp/webapp-events';

import {ACCOUNT_THEME_CHANNEL} from './AccountThemeContract';
import {createAccountThemeReceiver} from './AccountThemeReceiver';
import {createWebappBridge, exposeWebappBridge} from './WebappBridge';
import {createWebappEventBridge, WebappVersions} from './WebappEventBridge';
import {createWebappMainWorld} from './WebappMainWorld';

import {createDesktopAppConfig} from '../lib/desktopAppConfig';
import {EVENT_TYPE} from '../lib/eventType';
import {getLogger} from '../logging/getLogger';
import * as EnvironmentUtil from '../runtime/EnvironmentUtil';
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

const logger = getLogger(path.basename(__filename));
const mainWorld = createWebappMainWorld(contextBridge);

const themeReceiver = createAccountThemeReceiver(shouldUseDarkColors => {
  if (WebAppEvents.PROPERTIES.UPDATE.INTERFACE) {
    logger.info(`Switching dark mode ${shouldUseDarkColors ? 'on' : 'off'} ...`);
    mainWorld.publish(WebAppEvents.PROPERTIES.UPDATE.INTERFACE.USE_DARK_MODE, shouldUseDarkColors);
  }
});

ipcRenderer.on(ACCOUNT_THEME_CHANNEL, (_event, useDarkMode: unknown) => {
  themeReceiver.receive(useDarkMode);
});

webFrame.setZoomFactor(1.0);
webFrame.setVisualZoomLevelLimits(1, 1);

const subscribeToMainProcessEvents = (): void => {
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.ADD_PEOPLE, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.ADD_PEOPLE}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.ADD_PEOPLE);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.ARCHIVE, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.ARCHIVE}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.ARCHIVE);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.CALL, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.CALL}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.CALL.STATE.TOGGLE, false);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.DELETE, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.DELETE}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.DELETE);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.SHOW_NEXT, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.SHOW_NEXT}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.NEXT);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.PEOPLE, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.PEOPLE}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.PEOPLE);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.PING, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.PING}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.PING);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.SHOW_PREVIOUS, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.SHOW_PREVIOUS}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.PREV);
  });
  ipcRenderer.on(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, (_event, hash: string) => {
    logger.info(
      `Received event "${EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH}" (hash: "${hash}"), forwarding to amplify ...`,
    );
    mainWorld.setLocationHash(hash);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.TOGGLE_MUTE, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.TOGGLE_MUTE}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.SILENCE);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.START, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.START}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.START);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.SEARCH, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.SEARCH}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.SHORTCUT.SEARCH);
  });
  ipcRenderer.on(EVENT_TYPE.CONVERSATION.VIDEO_CALL, () => {
    logger.info(`Received event "${EVENT_TYPE.CONVERSATION.VIDEO_CALL}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.CALL.STATE.TOGGLE, true);
  });
  ipcRenderer.on(EVENT_TYPE.PREFERENCES.SHOW, () => {
    logger.info(`Received event "${EVENT_TYPE.PREFERENCES.SHOW}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.PREFERENCES.MANAGE_ACCOUNT);
  });
  ipcRenderer.on(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION, () => {
    logger.info(`Received event "${EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION}", reporting versions ...`);
    const versions = mainWorld.readVersions();
    if (versions) {
      reportWebappVersion(versions);
    }
  });
  ipcRenderer.on(EVENT_TYPE.ACTION.SIGN_OUT, () => {
    logger.info(`Received event "${EVENT_TYPE.ACTION.SIGN_OUT}", forwarding to amplify ...`);
    mainWorld.publish(WebAppEvents.LIFECYCLE.ASK_TO_CLEAR_DATA);
  });
  ipcRenderer.on(EVENT_TYPE.WRAPPER.UPDATE_AVAILABLE, () => {
    logger.info(`Received event "${EVENT_TYPE.WRAPPER.UPDATE_AVAILABLE}", forwarding to amplify ...`);
    mainWorld.publishUpdate();
  });
  ipcRenderer.on(WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED, () => {
    logger.info(`Received event "${WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED}", forwarding to window ...`);
    mainWorld.publish(WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED);
  });
  ipcRenderer.on(
    EVENT_TYPE.ACTION.JOIN_CONVERSATION,
    (_event, {code, key, domain}: {code: string; key: string; domain?: string}) => {
      logger.info(`Received event "${EVENT_TYPE.ACTION.JOIN_CONVERSATION}", forwarding to host ...`);
      ipcRenderer.sendToHost(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code, key, domain});
    },
  );
  ipcRenderer.on(
    WebAppEvents.CONVERSATION.JOIN,
    (_event, {code, key, domain}: {code: string; key: string; domain: string}) => {
      logger.info(`Received event "${WebAppEvents.CONVERSATION.JOIN}", forwarding to window ...`);
      mainWorld.dispatch(WebAppEvents.CONVERSATION.JOIN, {code, key, domain});
    },
  );
};

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

const webappEvents = createWebappEventBridge({
  activateNotification: () => {
    logger.info(`Received amplify event "${WebAppEvents.NOTIFICATION.CLICK}", forwarding event ...`);
    void requestNotificationActivation(ipcRenderer, logger);
    ipcRenderer.sendToHost(EVENT_TYPE.ACTION.NOTIFICATION_CLICK);
  },
  changeEnvironment: url => {
    if (typeof url === 'string' && url.length > 0) {
      ipcRenderer.sendToHost(EVENT_TYPE.WRAPPER.NAVIGATE_WEBVIEW, url);
    }
  },
  closeSsoWindow: () => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSE}" event`);
    void requestSsoWindowClose(ipcRenderer, logger);
  },
  focusSsoWindow: () => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.SSO_WINDOW_FOCUS}" event`);
    void requestSsoWindowFocus(ipcRenderer, logger);
  },
  loaded: () => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.LOADED}", forwarding event ...`);
    ipcRenderer.sendToHost(EVENT_TYPE.LIFECYCLE.SIGNED_IN);
    handleWebAppLoaded(ipcRenderer, logger, () => themeReceiver.markWebAppLoaded());
  },
  relaunch: () => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.RESTART}", forwarding event ...`);
    void requestWrapperRelaunch(ipcRenderer, logger);
  },
  reload: () => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.REFRESH}", forwarding event ...`);
    void requestWrapperReload(ipcRenderer, logger);
  },
  reportVersions: reportWebappVersion,
  sendSignedOut: clearData => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.SIGNED_OUT}", forwarding event ...`);
    ipcRenderer.sendToHost(EVENT_TYPE.LIFECYCLE.SIGNED_OUT, clearData);
  },
  sendSignOut: () => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.SIGN_OUT}", forwarding event ...`);
    ipcRenderer.sendToHost(EVENT_TYPE.LIFECYCLE.SIGN_OUT);
  },
  sendTeamInfo: info => {
    logger.info(`Received amplify event "${WebAppEvents.TEAM.INFO}", forwarding event ...`);
    ipcRenderer.sendToHost(EVENT_TYPE.ACCOUNT.UPDATE_INFO, info);
  },
  sendTheme: theme => ipcRenderer.sendToHost(EVENT_TYPE.UI.THEME_UPDATE, theme),
  sendUnreadCount: count => {
    logger.info(`Received amplify event "${WebAppEvents.LIFECYCLE.UNREAD_COUNT}", forwarding event ...`);
    ipcRenderer.sendToHost(EVENT_TYPE.LIFECYCLE.UNREAD_COUNT, count);
  },
  updateDownloadPath: downloadPath => {
    if (typeof downloadPath === 'undefined' || typeof downloadPath === 'string') {
      void requestDownloadLocationUpdate(ipcRenderer, logger, downloadPath);
    }
  },
});

/* istanbul ignore next -- the real-Electron compatibility suite exercises this preload composition root. */
const initializeWebappBridge = (): void => {
  // Read synchronously so the value is present when the webapp evaluates its desktop configuration.
  // The main-process handler returns a pre-read, memoized value, so the blocking call is negligible.
  let managedConfig = {applockOverride: false};
  try {
    managedConfig = ipcRenderer.sendSync(MANAGED_CONFIG_CHANNEL) ?? {applockOverride: false};
  } catch (error) {
    logger.warn('Failed to read managed config from the main process, treating the device as unmanaged:', error);
  }

  const webappBridge = createWebappBridge({
    decrypt: encrypted => ipcRenderer.invoke(SAFE_STORAGE_DECRYPT_CHANNEL, encrypted),
    desktopAppConfig: createDesktopAppConfig(EnvironmentUtil.app.DESKTOP_VERSION, managedConfig),
    encrypt: value => ipcRenderer.invoke(SAFE_STORAGE_ENCRYPT_CHANNEL, value),
    environment: EnvironmentUtil,
    events: webappEvents,
    getDesktopSources: options => requestDesktopSources(ipcRenderer, options),
    getOpenGraphData: getOpenGraphDataViaChannel,
  });
  exposeWebappBridge(contextBridge, webappBridge);
};

/* istanbul ignore next -- executed and asserted by LegacyPreloadCompatibility.test.main.ts. */
initializeWebappBridge();
mainWorld.install();
subscribeToMainProcessEvents();

window.addEventListener('DOMContentLoaded', async () => {
  // include context menu
  await import('./menu/preload-context');
});
