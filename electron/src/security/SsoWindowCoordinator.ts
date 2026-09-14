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

import {controlSsoWindowForAccount} from './SsoWindowControl';

interface ManagedSsoWindow {
  init(): Promise<unknown>;
  close(): void;
  focus(): void;
  isOwnedByAccount(accountId: string): boolean;
  onClose(): void;
}

export class SsoWindowCoordinator {
  private active: ManagedSsoWindow | null = null;

  constructor(private readonly onClosed: (accountId: string) => void) {}

  async open(accountId: string | undefined, create: () => ManagedSsoWindow): Promise<void> {
    if (!accountId) {
      return;
    }
    if (this.active) {
      this.control(accountId, 'focus');
      return;
    }
    const sso = create();
    this.active = sso;
    sso.onClose = () => {
      if (this.active === sso) {
        this.active = null;
        this.onClosed(accountId);
      }
    };
    try {
      await sso.init();
    } catch (error) {
      sso.close();
      throw error;
    }
  }

  control(accountId: string | undefined, action: 'close' | 'focus'): void {
    // Retain ownership until cleanup completes, not merely until close is requested.
    controlSsoWindowForAccount(this.active, accountId, action);
  }
}
