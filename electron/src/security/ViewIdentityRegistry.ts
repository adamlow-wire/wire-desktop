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

interface FrameIdentity {
  readonly url: string;
}

type SessionIdentity = object;

interface WebContentsIdentity {
  readonly id: number;
  readonly mainFrame: FrameIdentity;
  readonly session: SessionIdentity;
  isDestroyed(): boolean;
}

export type ViewType = 'about' | 'account' | 'application-shell' | 'picture-in-picture' | 'proxy-prompt' | 'sso';

export interface ViewRegistration {
  readonly accountId?: string;
  readonly allowedOrigin: string;
  readonly capabilities: readonly string[];
  readonly partition: string;
  readonly session: SessionIdentity;
  readonly viewType: ViewType;
  readonly webContents: WebContentsIdentity;
}

export interface AuthorizedViewIdentity extends ViewRegistration {
  readonly mainFrame: FrameIdentity;
}

export interface SenderIdentity {
  readonly sender: WebContentsIdentity;
  readonly senderFrame: FrameIdentity | null;
}

const hasAllowedOrigin = (value: string, allowedOrigin: string): boolean => {
  try {
    return new URL(value).origin === allowedOrigin;
  } catch {
    return false;
  }
};

export class ViewIdentityRegistry {
  private readonly identities = new Map<number, AuthorizedViewIdentity>();

  register(registration: ViewRegistration): AuthorizedViewIdentity {
    const hasValidAccountBinding =
      registration.viewType === 'account'
        ? typeof registration.accountId === 'string' && registration.accountId.length > 0
        : typeof registration.accountId === 'undefined';
    if (
      !hasValidAccountBinding ||
      registration.webContents.isDestroyed() ||
      registration.webContents.session !== registration.session ||
      this.identities.has(registration.webContents.id)
    ) {
      throw new Error('View cannot be registered.');
    }

    const identity = Object.freeze({
      accountId: registration.accountId,
      allowedOrigin: registration.allowedOrigin,
      capabilities: Object.freeze([...registration.capabilities]),
      partition: registration.partition,
      session: registration.session,
      viewType: registration.viewType,
      webContents: registration.webContents,
      mainFrame: registration.webContents.mainFrame,
    });
    this.identities.set(registration.webContents.id, identity);
    return identity;
  }

  unregister(webContentsId: number): void {
    this.identities.delete(webContentsId);
  }

  has(webContentsId: number): boolean {
    return this.identities.has(webContentsId);
  }

  authorize(sender: SenderIdentity, capability: string): AuthorizedViewIdentity {
    const identity = this.identities.get(sender.sender.id);
    const authorized =
      identity &&
      identity.webContents === sender.sender &&
      !sender.sender.isDestroyed() &&
      sender.sender.session === identity.session &&
      sender.senderFrame === identity.mainFrame &&
      hasAllowedOrigin(sender.senderFrame.url, identity.allowedOrigin) &&
      identity.capabilities.includes(capability);

    if (!authorized) {
      throw new Error('View request is not authorized.');
    }

    return identity;
  }
}
