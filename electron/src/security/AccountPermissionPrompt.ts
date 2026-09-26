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

import {app, BrowserWindow, session} from 'electron';
import type {IpcMainEvent} from 'electron';

import {randomUUID} from 'node:crypto';
import path from 'node:path';

import {
  ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL,
  ACCOUNT_PERMISSION_PROMPT_URL,
  AccountPermissionPromptModel,
  isAccountPermissionPromptModel,
  isOwnedPermissionPromptSender,
} from './AccountPermissionPromptContract';
import {installLocalContentProtocol} from './LocalContentProtocol';
import {bindNavigationGuard} from './NavigationGuard';

import {config} from '../settings/config';

export async function showAccountPermissionPrompt(
  owner: BrowserWindow,
  model: AccountPermissionPromptModel,
  signal: AbortSignal,
): Promise<boolean> {
  if (
    signal.aborted ||
    owner.isDestroyed() ||
    !owner.isVisible() ||
    owner.isMinimized() ||
    !isAccountPermissionPromptModel(model)
  ) {
    return false;
  }

  const target = session.fromPartition(`wire-permission-${randomUUID()}`, {cache: false});
  const directory = path.join(app.getAppPath(), config.electronDirectory);
  let uninstall: () => void;
  try {
    uninstall = installLocalContentProtocol(target, directory, 'permission-consent');
  } catch {
    return false;
  }

  let prompt: BrowserWindow;
  try {
    target.setPermissionCheckHandler(() => false);
    target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    target.on('will-download', event => event.preventDefault());
    prompt = new BrowserWindow({
      parent: owner,
      modal: true,
      show: false,
      width: 500,
      height: Math.max(330, Math.min(480, 240 + model.scopes.length * 76)),
      minWidth: 440,
      minHeight: 330,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      autoHideMenuBar: true,
      backgroundColor: '#f5f7fa',
      title: model.title,
      webPreferences: {
        session: target,
        preload: path.join(directory, 'dist/preload/preload-account-permission.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webviewTag: false,
        webSecurity: true,
      },
    });
    prompt.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
    bindNavigationGuard(prompt.webContents, url => url === ACCOUNT_PERMISSION_PROMPT_URL);
  } catch {
    try {
      prompt!.destroy();
    } catch {
      // A failed prompt cannot grant permission.
    }
    try {
      uninstall();
    } catch {
      // The unique in-memory session has no accepted permission.
    }
    return false;
  }

  const contents = prompt.webContents;
  return new Promise(resolve => {
    let settled = false;
    let ready = false;
    const deny = (): void => settle(false);
    const authorized = (event: IpcMainEvent): boolean => {
      try {
        return isOwnedPermissionPromptSender(event, contents, target) && !owner.isDestroyed() && !signal.aborted;
      } catch {
        return false;
      }
    };
    const onMessage = (event: IpcMainEvent, channel: string, ...args: unknown[]): void => {
      if (
        channel !== ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL &&
        channel !== ACCOUNT_PERMISSION_PROMPT_DECISION_CHANNEL
      ) {
        return;
      }
      if (!authorized(event)) {
        deny();
        return;
      }
      if (channel === ACCOUNT_PERMISSION_PROMPT_READY_CHANNEL) {
        if (ready || args.length) {
          deny();
          return;
        }
        ready = true;
        try {
          prompt.show();
          prompt.focus();
        } catch {
          deny();
        }
        return;
      }
      if (!ready || args.length !== 1 || typeof args[0] !== 'boolean') {
        deny();
        return;
      }
      settle(args[0] && prompt.isFocused() && owner.isVisible() && !owner.isMinimized());
    };
    const settle = (approved: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', deny);
      owner.removeListener('closed', deny);
      owner.removeListener('hide', deny);
      owner.removeListener('minimize', deny);
      prompt.removeListener('closed', deny);
      let cleaned = !prompt.isDestroyed();
      try {
        contents.removeListener('ipc-message', onMessage);
        contents.removeListener('render-process-gone', deny);
      } catch {
        cleaned = false;
      }
      if (!prompt.isDestroyed()) {
        try {
          prompt.destroy();
        } catch {
          cleaned = false;
        }
      }
      try {
        uninstall();
      } catch {
        cleaned = false;
      }
      resolve(approved && cleaned);
    };
    const timeout = setTimeout(deny, 60_000);
    signal.addEventListener('abort', deny, {once: true});
    owner.once('closed', deny);
    owner.once('hide', deny);
    owner.once('minimize', deny);
    prompt.once('closed', deny);
    contents.on('ipc-message', onMessage);
    contents.once('render-process-gone', deny);
    void prompt
      .loadURL(ACCOUNT_PERMISSION_PROMPT_URL)
      .then(() => {
        if (!settled && !prompt.isDestroyed()) {
          contents.send(ACCOUNT_PERMISSION_PROMPT_MODEL_CHANNEL, model);
        }
      })
      .catch(deny);
  });
}
