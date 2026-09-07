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

import {truncate} from 'lodash';

import {WebAppEvents} from '@wireapp/webapp-events';

import {EVENT_TYPE} from '../lib/eventType';
import type {i18nStrings, SupportedI18nLanguage} from '../locale';

interface ApplicationShellBridgeDependencies {
  deleteAccountData(viewInstanceId: number, accountId: string, sessionId?: string): Promise<void>;
  getWebContentsId(accountId: string): number | undefined;
  log(message: string): void;
  sendToAccount(accountId: string, channel: string, ...args: unknown[]): void | Promise<void>;
  submitDeepLink(url: string): void;
  updateBadgeCount(count: number, ignoreFlash: boolean): void;
}

export interface ApplicationShellBridge {
  sendBadgeCount(count: number, ignoreFlash: boolean): void;
  sendConversationJoinToHost(accountId: string, code: string, key: string, domain?: string): Promise<void>;
  sendDeleteAccount(accountId: string, sessionId?: string): Promise<void>;
  sendLogoutAccount(accountId: string): Promise<void>;
  submitDeepLink(url: string): void;
}

interface ApplicationShellBootstrap {
  isMac: boolean;
  locale: SupportedI18nLanguage;
  locStrings: i18nStrings;
  locStringsDefault: i18nStrings;
}

type BridgeExposer = Pick<Electron.ContextBridge, 'exposeInMainWorld'>;

export const createApplicationShellBridge = (
  dependencies: ApplicationShellBridgeDependencies,
): Readonly<ApplicationShellBridge> =>
  Object.freeze({
    sendBadgeCount: (count: number, ignoreFlash: boolean): void => {
      dependencies.updateBadgeCount(count, ignoreFlash);
    },
    sendConversationJoinToHost: async (
      accountId: string,
      code: string,
      key: string,
      domain?: string,
    ): Promise<void> => {
      dependencies.log(`Sending conversation join data to webview for account "${truncate(accountId, {length: 5})}".`);
      await dependencies.sendToAccount(accountId, WebAppEvents.CONVERSATION.JOIN, {code, key, domain});
    },
    sendDeleteAccount: async (accountId: string, sessionId?: string): Promise<void> => {
      const webContentsId = dependencies.getWebContentsId(accountId);
      if (typeof webContentsId === 'undefined') {
        throw new Error(`Webview for account "${truncate(accountId, {length: 5})}" does not exist`);
      }

      dependencies.log(`Processing deletion of "${truncate(accountId, {length: 5})}"`);
      await dependencies.deleteAccountData(webContentsId, accountId, sessionId);
    },
    sendLogoutAccount: async (accountId: string): Promise<void> => {
      dependencies.log(`Sending logout signal to webview for account "${truncate(accountId, {length: 5})}".`);
      await dependencies.sendToAccount(accountId, EVENT_TYPE.ACTION.SIGN_OUT);
    },
    submitDeepLink: (url: string): void => {
      dependencies.submitDeepLink(url);
    },
  });

export const exposeApplicationShellBridge = (
  contextBridge: BridgeExposer,
  bootstrap: ApplicationShellBootstrap,
  bridge: Readonly<ApplicationShellBridge>,
): void => {
  contextBridge.exposeInMainWorld('locStrings', bootstrap.locStrings);
  contextBridge.exposeInMainWorld('locStringsDefault', bootstrap.locStringsDefault);
  contextBridge.exposeInMainWorld('locale', bootstrap.locale);
  contextBridge.exposeInMainWorld('isMac', bootstrap.isMac);
  contextBridge.exposeInMainWorld('sendBadgeCount', bridge.sendBadgeCount);
  contextBridge.exposeInMainWorld('submitDeepLink', bridge.submitDeepLink);
  contextBridge.exposeInMainWorld('sendDeleteAccount', bridge.sendDeleteAccount);
  contextBridge.exposeInMainWorld('sendLogoutAccount', bridge.sendLogoutAccount);
  contextBridge.exposeInMainWorld('sendConversationJoinToHost', bridge.sendConversationJoinToHost);
};
