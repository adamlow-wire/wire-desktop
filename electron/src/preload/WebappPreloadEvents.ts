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

import {WebAppEvents} from '@wireapp/webapp-events';

import {createAccountThemeReceiver} from './AccountThemeReceiver';
import {createWebappEventBridge, WebappEventBridge, WebappVersions} from './WebappEventBridge';
import {WebappMainWorld} from './WebappMainWorld';

import {EVENT_TYPE} from '../lib/eventType';

interface IpcBoundary {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  sendToHost(channel: string, ...args: unknown[]): void;
}

interface Logger {
  info(message: string): void;
}

export interface WebappPreloadEventActions {
  activateNotification(): void;
  closeSsoWindow(): void;
  focusSsoWindow(): void;
  loaded(markThemeLoaded: () => void): void;
  relaunch(): void;
  reload(): void;
  reportVersions(versions: WebappVersions): void;
  updateDownloadPath(downloadPath: string | undefined): void;
}

export interface WebappPreloadEvents {
  readonly events: Readonly<WebappEventBridge>;
  readonly receiveTheme: (value: unknown) => void;
  readonly subscribeToMainProcessEvents: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createWebappPreloadEvents = ({
  actions,
  ipc,
  logger,
  mainWorld,
}: {
  actions: WebappPreloadEventActions;
  ipc: IpcBoundary;
  logger: Logger;
  mainWorld: WebappMainWorld;
}): WebappPreloadEvents => {
  const themeReceiver = createAccountThemeReceiver(shouldUseDarkColors => {
    logger.info(`Switching dark mode ${shouldUseDarkColors ? 'on' : 'off'} ...`);
    mainWorld.publish(WebAppEvents.PROPERTIES.UPDATE.INTERFACE.USE_DARK_MODE, shouldUseDarkColors);
  });

  const events = createWebappEventBridge({
    activateNotification: () => {
      actions.activateNotification();
      ipc.sendToHost(EVENT_TYPE.ACTION.NOTIFICATION_CLICK);
    },
    changeEnvironment: url => {
      if (typeof url === 'string' && url.length > 0) {
        ipc.sendToHost(EVENT_TYPE.WRAPPER.NAVIGATE_WEBVIEW, url);
      }
    },
    closeSsoWindow: actions.closeSsoWindow,
    focusSsoWindow: actions.focusSsoWindow,
    loaded: () => {
      ipc.sendToHost(EVENT_TYPE.LIFECYCLE.SIGNED_IN);
      actions.loaded(themeReceiver.markWebAppLoaded);
    },
    relaunch: actions.relaunch,
    reload: actions.reload,
    reportVersions: actions.reportVersions,
    sendSignedOut: clearData => ipc.sendToHost(EVENT_TYPE.LIFECYCLE.SIGNED_OUT, clearData),
    sendSignOut: () => ipc.sendToHost(EVENT_TYPE.LIFECYCLE.SIGN_OUT),
    sendTeamInfo: info => ipc.sendToHost(EVENT_TYPE.ACCOUNT.UPDATE_INFO, info),
    sendTheme: theme => ipc.sendToHost(EVENT_TYPE.UI.THEME_UPDATE, theme),
    sendUnreadCount: count => ipc.sendToHost(EVENT_TYPE.LIFECYCLE.UNREAD_COUNT, count),
    updateDownloadPath: downloadPath => {
      if (typeof downloadPath === 'undefined' || typeof downloadPath === 'string') {
        actions.updateDownloadPath(downloadPath);
      }
    },
  });

  const publish = (incoming: string, outgoing: string, ...args: unknown[]): void => {
    ipc.on(incoming, () => {
      logger.info(`Received event "${incoming}", forwarding to the webapp ...`);
      mainWorld.publish(outgoing, ...args);
    });
  };

  const subscribeToMainProcessEvents = (): void => {
    publish(EVENT_TYPE.CONVERSATION.ADD_PEOPLE, WebAppEvents.SHORTCUT.ADD_PEOPLE);
    publish(EVENT_TYPE.CONVERSATION.ARCHIVE, WebAppEvents.SHORTCUT.ARCHIVE);
    publish(EVENT_TYPE.CONVERSATION.CALL, WebAppEvents.CALL.STATE.TOGGLE, false);
    publish(EVENT_TYPE.CONVERSATION.DELETE, WebAppEvents.SHORTCUT.DELETE);
    publish(EVENT_TYPE.CONVERSATION.SHOW_NEXT, WebAppEvents.SHORTCUT.NEXT);
    publish(EVENT_TYPE.CONVERSATION.PEOPLE, WebAppEvents.SHORTCUT.PEOPLE);
    publish(EVENT_TYPE.CONVERSATION.PING, WebAppEvents.SHORTCUT.PING);
    publish(EVENT_TYPE.CONVERSATION.SHOW_PREVIOUS, WebAppEvents.SHORTCUT.PREV);
    publish(EVENT_TYPE.CONVERSATION.TOGGLE_MUTE, WebAppEvents.SHORTCUT.SILENCE);
    publish(EVENT_TYPE.CONVERSATION.START, WebAppEvents.SHORTCUT.START);
    publish(EVENT_TYPE.CONVERSATION.SEARCH, WebAppEvents.SHORTCUT.SEARCH);
    publish(EVENT_TYPE.CONVERSATION.VIDEO_CALL, WebAppEvents.CALL.STATE.TOGGLE, true);
    publish(EVENT_TYPE.PREFERENCES.SHOW, WebAppEvents.PREFERENCES.MANAGE_ACCOUNT);
    publish(EVENT_TYPE.ACTION.SIGN_OUT, WebAppEvents.LIFECYCLE.ASK_TO_CLEAR_DATA);
    publish(WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED, WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED);

    ipc.on(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, (_event, hash) => {
      if (typeof hash === 'string') {
        mainWorld.setLocationHash(hash);
      }
    });
    ipc.on(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION, () => {
      const versions = mainWorld.readVersions();
      if (versions) {
        actions.reportVersions(versions);
      }
    });
    ipc.on(EVENT_TYPE.WRAPPER.UPDATE_AVAILABLE, () => mainWorld.publishUpdate());
    ipc.on(EVENT_TYPE.ACTION.JOIN_CONVERSATION, (_event, value) => {
      if (isRecord(value) && typeof value.code === 'string' && typeof value.key === 'string') {
        const domain = typeof value.domain === 'string' ? value.domain : undefined;
        ipc.sendToHost(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code: value.code, domain, key: value.key});
      }
    });
    ipc.on(WebAppEvents.CONVERSATION.JOIN, (_event, value) => {
      if (
        isRecord(value) &&
        typeof value.code === 'string' &&
        typeof value.key === 'string' &&
        (value.domain === undefined || value.domain === null || typeof value.domain === 'string')
      ) {
        mainWorld.dispatch(WebAppEvents.CONVERSATION.JOIN, {
          code: value.code,
          domain: value.domain,
          key: value.key,
        });
      }
    });
  };

  return Object.freeze({events, receiveTheme: themeReceiver.receive, subscribeToMainProcessEvents});
};
