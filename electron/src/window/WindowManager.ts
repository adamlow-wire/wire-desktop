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

import {app, BrowserWindow} from 'electron';

import * as path from 'path';

import {EVENT_TYPE} from '../lib/eventType';
import {getLogger} from '../logging/getLogger';

const logger = getLogger(path.basename(__filename));

export class WindowManager {
  private static primaryWindowId: number | undefined;
  private static nativeActions: {windowId: number; send(channel: string, args: unknown[]): void} | undefined;
  public static actionsQueue: {action: string; args: any[]}[] = [];

  static getPrimaryWindow(): BrowserWindow | undefined {
    const [primaryWindow] = WindowManager.primaryWindowId
      ? [BrowserWindow.fromId(WindowManager.primaryWindowId)]
      : BrowserWindow.getAllWindows();
    if (primaryWindow) {
      logger.info(`Got primaryWindow with ID "${primaryWindow.id}"`);
      return primaryWindow;
    }
    return undefined;
  }

  static setPrimaryWindowId(newPrimaryWindowId: number): void {
    logger.info(`Setting primary window ID to "${newPrimaryWindowId}" ...`);
    WindowManager.primaryWindowId = newPrimaryWindowId;
  }

  static bindNativeActions(windowId: number, send: (channel: string, args: unknown[]) => void): () => void {
    const binding = {windowId, send};
    WindowManager.nativeActions = binding;
    return () => {
      if (WindowManager.nativeActions === binding) {
        WindowManager.nativeActions = undefined;
      }
    };
  }

  static dispatchNativeAction(windowId: number, channel: string, args: unknown[]): boolean {
    const binding = WindowManager.nativeActions;
    const supported: string[] = [
      EVENT_TYPE.UI.SYSTEM_MENU,
      EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION,
      EVENT_TYPE.ACTION.SWITCH_ACCOUNT,
      ...Object.values(EVENT_TYPE.EDIT),
    ];
    if (!binding || binding.windowId !== windowId || !supported.includes(channel)) {
      return false;
    }
    if (channel !== EVENT_TYPE.UI.SYSTEM_MENU || (args.length === 1 && typeof args[0] === 'string')) {
      binding.send(channel, args);
    }
    return true;
  }

  static showPrimaryWindow(): void {
    const browserWindow = WindowManager.getPrimaryWindow();

    if (browserWindow) {
      if (browserWindow.isMinimized()) {
        browserWindow.restore();
      } else if (!browserWindow.isVisible()) {
        browserWindow.show();
      }

      browserWindow.focus();
    }
  }

  static sendActionToPrimaryWindow(action: string, ...args: any[]): void {
    const primaryWindow = WindowManager.getPrimaryWindow();

    if (primaryWindow) {
      logger.info(`Sending action "${action}" to window with ID "${primaryWindow.id}":`, {args});
      if (WindowManager.dispatchNativeAction(primaryWindow.id, action, args)) {
        return;
      }
      primaryWindow.webContents.send(action, ...args);
    } else {
      logger.warn(`Got no primary window, can't send action "${action}".`);
    }
  }

  static flushActionsQueue() {
    const actions = WindowManager.actionsQueue;
    WindowManager.actionsQueue = [];
    actions.forEach(({action, args}) => this.sendActionToPrimaryWindow(action, ...args));
  }

  static async sendActionAndFocusWindow(action: string, ...args: any[]): Promise<void> {
    await app.whenReady();

    const primaryWindow = WindowManager.getPrimaryWindow();

    if (primaryWindow) {
      if (primaryWindow.webContents.isLoading()) {
        // If the webapp is not yet loaded we queue the action we want to send. It will be flushed later on by the flushActionsQueue` method
        WindowManager.actionsQueue.push({action, args});
      } else {
        if (!primaryWindow.isVisible()) {
          primaryWindow.show();
          primaryWindow.focus();
        }
        WindowManager.sendActionToPrimaryWindow(action, ...args);
      }
    } else {
      logger.warn(`Got no primary window, can't send action "${action}".`);
    }
  }
}
