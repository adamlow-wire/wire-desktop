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

import {ProxyPromptCredentials} from '../security/ProxyPromptContract';

export interface ProxyPromptActions {
  cancel(): void | Promise<void>;
  submit(credentials: ProxyPromptCredentials): void | Promise<void>;
}

export class ProxyPromptCoordinator {
  private readonly activePrompts = new Map<number, ProxyPromptActions>();

  register(webContentsId: number, actions: ProxyPromptActions): void {
    if (!Number.isSafeInteger(webContentsId) || webContentsId <= 0 || this.activePrompts.has(webContentsId)) {
      throw new Error('Proxy prompt cannot be registered.');
    }
    this.activePrompts.set(webContentsId, actions);
  }

  has(webContentsId: number): boolean {
    return this.activePrompts.has(webContentsId);
  }

  submit(webContentsId: number, credentials: ProxyPromptCredentials): Promise<void> {
    return this.consume(webContentsId, actions => actions.submit(credentials));
  }

  cancel(webContentsId: number): Promise<void> {
    return this.consume(webContentsId, actions => actions.cancel());
  }

  private async consume(
    webContentsId: number,
    action: (actions: ProxyPromptActions) => void | Promise<void>,
  ): Promise<void> {
    const actions = this.activePrompts.get(webContentsId);
    if (!actions) {
      throw new Error('Proxy prompt is not active.');
    }
    this.activePrompts.delete(webContentsId);
    try {
      await action(actions);
    } catch (error) {
      if (!this.activePrompts.has(webContentsId)) {
        this.activePrompts.set(webContentsId, actions);
      }
      throw error;
    }
  }
}
