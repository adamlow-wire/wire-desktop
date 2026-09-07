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

export interface WebappVersions {
  webappAVSVersion?: string;
  webappVersion: string;
}

export interface WebappEventBridgeDependencies {
  activateNotification(): void;
  changeEnvironment(url: unknown): void;
  closeSsoWindow(): void;
  focusSsoWindow(): void;
  loaded(): void;
  reportVersions(versions: WebappVersions): void;
  relaunch(): void;
  reload(): void;
  sendSignedOut(clearData: unknown): void;
  sendSignOut(): void;
  sendTeamInfo(info: unknown): void;
  sendTheme(theme: unknown): void;
  sendUnreadCount(count: unknown): void;
  updateDownloadPath(downloadPath: unknown): void;
}

export interface WebappEventBridge {
  activateNotification(): void;
  changeEnvironment(url: unknown): void;
  closeSsoWindow(): void;
  focusSsoWindow(): void;
  loaded(): void;
  reportVersions(versions: WebappVersions): void;
  relaunch(): void;
  reload(): void;
  signedOut(clearData: unknown): void;
  signOut(): void;
  teamInfo(info: unknown): void;
  theme(theme: unknown): void;
  unreadCount(count: unknown): void;
  updateDownloadPath(downloadPath: unknown): void;
}

export const createWebappEventBridge = (dependencies: WebappEventBridgeDependencies): Readonly<WebappEventBridge> =>
  Object.freeze({
    activateNotification: dependencies.activateNotification,
    changeEnvironment: dependencies.changeEnvironment,
    closeSsoWindow: dependencies.closeSsoWindow,
    focusSsoWindow: dependencies.focusSsoWindow,
    loaded: dependencies.loaded,
    reportVersions: dependencies.reportVersions,
    relaunch: dependencies.relaunch,
    reload: dependencies.reload,
    signedOut: dependencies.sendSignedOut,
    signOut: dependencies.sendSignOut,
    teamInfo: dependencies.sendTeamInfo,
    theme: dependencies.sendTheme,
    unreadCount: dependencies.sendUnreadCount,
    updateDownloadPath: dependencies.updateDownloadPath,
  });
