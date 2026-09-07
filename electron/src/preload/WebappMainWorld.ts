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

interface WebappEventNames {
  changeEnvironment: string;
  downloadPathUpdate: string;
  loaded: string;
  notificationClick: string;
  propertiesUpdated: string;
  refresh: string;
  restart: string;
  signOut: string;
  signedOut: string;
  ssoWindowClose: string;
  ssoWindowFocus: string;
  teamInfo: string;
  theme: string;
  unreadCount: string;
}

interface MainWorldBridge {
  events: import('./WebappEventBridge').WebappEventBridge;
}

export const WEBAPP_EVENT_NAMES: Readonly<WebappEventNames> = Object.freeze({
  changeEnvironment: WebAppEvents.LIFECYCLE.CHANGE_ENVIRONMENT,
  downloadPathUpdate: WebAppEvents.TEAM.DOWNLOAD_PATH_UPDATE,
  loaded: WebAppEvents.LIFECYCLE.LOADED,
  notificationClick: WebAppEvents.NOTIFICATION.CLICK,
  propertiesUpdated: WebAppEvents.PROPERTIES.UPDATED,
  refresh: WebAppEvents.LIFECYCLE.REFRESH,
  restart: WebAppEvents.LIFECYCLE.RESTART,
  signedOut: WebAppEvents.LIFECYCLE.SIGNED_OUT,
  signOut: WebAppEvents.LIFECYCLE.SIGN_OUT,
  ssoWindowClose: WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSE,
  ssoWindowFocus: WebAppEvents.LIFECYCLE.SSO_WINDOW_FOCUS,
  teamInfo: WebAppEvents.TEAM.INFO,
  theme: WebAppEvents.PROPERTIES.UPDATE.INTERFACE.THEME,
  unreadCount: WebAppEvents.LIFECYCLE.UNREAD_COUNT,
});

export function installWebappEventAdapter(eventNames: WebappEventNames): void {
  const register = (): void => {
    const bridge = (window as unknown as {wireDesktopBridge?: MainWorldBridge}).wireDesktopBridge;
    if (!bridge || !window.amplify || !window.wire || !window.z?.event) {
      window.setTimeout(register, 500);
      return;
    }

    const events = bridge.events;
    window.amplify.subscribe(eventNames.refresh, events.reload);
    window.amplify.subscribe(eventNames.restart, events.relaunch);
    window.amplify.subscribe(eventNames.loaded, () => {
      events.loaded();
    });
    window.amplify.subscribe(eventNames.signOut, events.signOut);
    window.amplify.subscribe(eventNames.signedOut, events.signedOut);
    window.amplify.subscribe(eventNames.ssoWindowClose, events.closeSsoWindow);
    window.amplify.subscribe(eventNames.ssoWindowFocus, events.focusSsoWindow);
    window.amplify.subscribe(eventNames.unreadCount, events.unreadCount);
    window.amplify.subscribe(eventNames.notificationClick, events.activateNotification);
    window.amplify.subscribe(eventNames.teamInfo, events.teamInfo);
    window.amplify.subscribe(eventNames.downloadPathUpdate, events.updateDownloadPath);
    window.amplify.subscribe(eventNames.theme, events.theme);
    window.amplify.subscribe(eventNames.propertiesUpdated, (properties: {settings?: {interface?: {theme?: unknown}}}) =>
      events.theme(properties?.settings?.interface?.theme),
    );
    window.addEventListener(eventNames.changeEnvironment, event =>
      events.changeEnvironment((event as CustomEvent).detail?.url),
    );
    events.reportVersions({
      webappAVSVersion: window.z.util.Environment.avsVersion?.(),
      webappVersion: window.z.util.Environment.version(false),
    });
  };

  window.addEventListener('DOMContentLoaded', register, {once: true});
  window.close = (): void => undefined;
}

export function publishWebappEvent(eventName: string, args: unknown[]): void {
  window.amplify?.publish(eventName, ...args);
}

export function setWebappLocationHash(hash: string): void {
  window.location.hash = hash;
}

export function dispatchWebappEvent(eventName: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(eventName, {detail}));
}

export function publishDesktopUpdate(eventName: string): void {
  window.amplify?.publish(eventName, window.z?.lifecycle.UPDATE_SOURCE.DESKTOP);
}

export function readWebappVersions(): import('./WebappEventBridge').WebappVersions | undefined {
  if (!window.z?.util?.Environment) {
    return undefined;
  }
  return {
    webappAVSVersion: window.z.util.Environment.avsVersion?.(),
    webappVersion: window.z.util.Environment.version(false),
  };
}

type MainWorldExecutor = Pick<Electron.ContextBridge, 'executeInMainWorld'>;

export interface WebappMainWorld {
  dispatch(eventName: string, detail: unknown): void;
  install(): void;
  publish(eventName: string, ...args: unknown[]): void;
  publishUpdate(): void;
  readVersions(): import('./WebappEventBridge').WebappVersions | undefined;
  setLocationHash(hash: string): void;
}

export const createWebappMainWorld = (executor: MainWorldExecutor): WebappMainWorld => ({
  dispatch: (eventName: string, detail: unknown): void =>
    executor.executeInMainWorld({args: [eventName, detail], func: dispatchWebappEvent}),
  install: (): void => executor.executeInMainWorld({args: [WEBAPP_EVENT_NAMES], func: installWebappEventAdapter}),
  publish: (eventName: string, ...args: unknown[]): void =>
    executor.executeInMainWorld({args: [eventName, args], func: publishWebappEvent}),
  publishUpdate: (): void =>
    executor.executeInMainWorld({args: [WebAppEvents.LIFECYCLE.UPDATE], func: publishDesktopUpdate}),
  readVersions: (): import('./WebappEventBridge').WebappVersions | undefined =>
    executor.executeInMainWorld({func: readWebappVersions}),
  setLocationHash: (hash: string): void => executor.executeInMainWorld({args: [hash], func: setWebappLocationHash}),
});
