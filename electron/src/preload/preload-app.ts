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

import {WebAppEvents} from '@wireapp/webapp-events';

import {createApplicationShellBridge, exposeApplicationShellBridge} from './ApplicationShellBridge';
import {createApplicationShellMainWorld} from './ApplicationShellMainWorld';

import {EVENT_TYPE} from '../lib/eventType';
import {LANGUAGES, SupportedI18nLanguage} from '../locale/languages';
import {readRendererLocale} from '../runtime/rendererRuntimeArguments';
import {requestAccountDataDeletion} from '../security/AccountDataDeletionIpc';
import {requestBadgeCountUpdate} from '../security/BadgeCountIpc';
import {requestDeepLinkSubmission} from '../security/DeepLinkSubmitIpc';
import {AutomatedSingleSignOn} from '../sso/AutomatedSingleSignOn';

const logger = console;
const requestedLocale = (readRendererLocale() ?? 'en').substring(0, 2) as SupportedI18nLanguage;
const currentLocale = Object.hasOwn(LANGUAGES, requestedLocale) ? requestedLocale : 'en';

webFrame.setVisualZoomLevelLimits(1, 1);

const mainWorld = createApplicationShellMainWorld(contextBridge);

const subscribeToMainProcessEvents = (): void => {
  ipcRenderer.on(EVENT_TYPE.ACCOUNT.SSO_LOGIN, (_event, code: string) => new AutomatedSingleSignOn().start(code));
  ipcRenderer.on(
    EVENT_TYPE.ACTION.JOIN_CONVERSATION,
    (_event, {code, key, domain}: {code: string; key: string; domain?: string}) => {
      mainWorld.sendToSelected(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code, key, domain});
    },
  );

  ipcRenderer.on(EVENT_TYPE.UI.SYSTEM_MENU, (_event, action: string) => {
    mainWorld.sendToSelected(action);
  });

  ipcRenderer.on(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION, () => {
    mainWorld.sendToSelected(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION);
  });

  ipcRenderer.on(WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED, () => {
    mainWorld.sendToSelected(WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED);
  });

  ipcRenderer.on(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, (_event, hash: string) => {
    mainWorld.sendToSelected(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, hash);
  });

  ipcRenderer.on(EVENT_TYPE.EDIT.COPY, () => mainWorld.operateSelected('copy'));
  ipcRenderer.on(EVENT_TYPE.EDIT.CUT, () => mainWorld.operateSelected('cut'));
  ipcRenderer.on(EVENT_TYPE.EDIT.PASTE, () => mainWorld.operateSelected('paste'));
  ipcRenderer.on(EVENT_TYPE.EDIT.REDO, () => mainWorld.operateSelected('redo'));
  ipcRenderer.on(EVENT_TYPE.EDIT.SELECT_ALL, () => mainWorld.operateSelected('selectAll'));
  ipcRenderer.on(EVENT_TYPE.EDIT.UNDO, () => mainWorld.operateSelected('undo'));

  ipcRenderer.on(EVENT_TYPE.WRAPPER.RELOAD, () => mainWorld.reloadAll());

  ipcRenderer.on(EVENT_TYPE.ACTION.SWITCH_ACCOUNT, (event, accountIndex: number) => {
    window.dispatchEvent(new CustomEvent(EVENT_TYPE.ACTION.SWITCH_ACCOUNT, {detail: {accountIndex}}));
  });

  ipcRenderer.on(EVENT_TYPE.ACTION.START_LOGIN, event => {
    window.dispatchEvent(new CustomEvent(EVENT_TYPE.ACTION.START_LOGIN));
  });
};

/* istanbul ignore next -- the real-Electron compatibility suite exercises this preload composition root. */
const initializeApplicationShellBridge = (): void => {
  const applicationShellBridge = createApplicationShellBridge({
    deleteAccountData: (viewInstanceId, accountId, sessionId) =>
      requestAccountDataDeletion(ipcRenderer, viewInstanceId, accountId, sessionId),
    getWebContentsId: mainWorld.getWebContentsId,
    log: message => logger.log(message),
    sendToAccount: mainWorld.sendToAccount,
    submitDeepLink: url => void requestDeepLinkSubmission(ipcRenderer, logger, url),
    updateBadgeCount: (count, ignoreFlash) => void requestBadgeCountUpdate(ipcRenderer, logger, count, ignoreFlash),
  });

  exposeApplicationShellBridge(
    contextBridge,
    {
      isMac: process.platform === 'darwin',
      locale: currentLocale,
      locStrings: LANGUAGES[currentLocale],
      locStringsDefault: LANGUAGES.en,
    },
    applicationShellBridge,
  );
};

/* istanbul ignore next -- executed and asserted by LegacyPreloadCompatibility.test.main.ts. */
initializeApplicationShellBridge();
subscribeToMainProcessEvents();

window.addEventListener('focus', () => {
  mainWorld.focusSelected();
});
