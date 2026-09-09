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


const {contextBridge, ipcRenderer} = require('electron');
const joins = [];
ipcRenderer.on('wire.webapp.conversation.join', (_event, data) => joins.push(data));

// Test-only named probes; this preload is never packaged as an account preload.
contextBridge.exposeInMainWorld('accountFixture', {
  loaded: () => ipcRenderer.invoke('wire-desktop:account:event:v1', {type: 'loaded'}),
  metadata: data => ipcRenderer.invoke('wire-desktop:account:event:v1', {type: 'metadata', data}),
  signedOut: clearData => ipcRenderer.invoke('wire-desktop:account:event:v1', {type: 'signed-out', clearData}),
  join: data => ipcRenderer.invoke('wire-desktop:account:event:v1', {type: 'join', ...data}),
  environment: url => ipcRenderer.invoke('wire-desktop:account:event:v1', {type: 'environment', url}),
  readJoins: () => joins,
  add: () => ipcRenderer.invoke('wire-desktop:accounts:control:v1', {action: 'add'}),
  select: accountId => ipcRenderer.invoke('wire-desktop:accounts:control:v1', {action: 'select', accountId}),
  remove: accountId => ipcRenderer.invoke('wire-desktop:accounts:control:v1', {action: 'remove', accountId}),
});
