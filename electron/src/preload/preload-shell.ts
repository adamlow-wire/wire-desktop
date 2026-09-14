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

import {contextBridge, ipcRenderer, webFrame} from 'electron';

import {createAccountShellBridge} from './AccountShellBridge';
import {createApplicationShellBootstrap} from './ApplicationShellBootstrap';

import {readRendererLocale} from '../runtime/rendererRuntimeArguments';
import {requestDeepLinkSubmission} from '../security/DeepLinkSubmitIpc';

webFrame.setVisualZoomLevelLimits(1, 1);
const accounts = createAccountShellBridge(ipcRenderer);
contextBridge.exposeInMainWorld('wireAccounts', accounts);
const bootstrap = createApplicationShellBootstrap(readRendererLocale(), process.platform);
for (const [name, value] of Object.entries(bootstrap)) {
  contextBridge.exposeInMainWorld(name, value);
}
contextBridge.exposeInMainWorld('sendDeleteAccount', (id: string) => accounts.remove(id));
contextBridge.exposeInMainWorld('sendLogoutAccount', (id: string) => accounts.logout(id));
contextBridge.exposeInMainWorld('sendConversationJoinToHost', accounts.join);
contextBridge.exposeInMainWorld(
  'submitDeepLink',
  (url: string) => void requestDeepLinkSubmission(ipcRenderer, console, url),
);
