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

import type {BrowserWindow, WebContents} from 'electron';

import {DISPLAY_CAPTURE_CAPABILITY} from './display/DisplayCaptureContract';

import {AuthorizedViewIdentity, ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

interface ParentBinding {
  readonly parent: WebContents;
  readonly child: BrowserWindow;
  readonly identity: AuthorizedViewIdentity;
  dispose(): void;
}

/** Detached calls inherit authority only for the lifetime of their exact parent account document. */
export class PictureInPictureOwners {
  private readonly bindings = new Map<number, ParentBinding>();

  constructor(private readonly registry: ViewIdentityRegistry) {}

  bind(parent: WebContents, child: BrowserWindow): void {
    const identity = this.registry.authorize(
      {sender: parent, senderFrame: parent.mainFrame},
      DISPLAY_CAPTURE_CAPABILITY,
    );
    if (
      identity.viewType !== 'account' ||
      child.webContents.session !== parent.session ||
      this.bindings.has(child.webContents.id) ||
      [...this.bindings.values()].some(binding => binding.parent === parent)
    ) {
      throw new Error('Detached call has no authorized parent account.');
    }
    const childId = child.webContents.id;
    const close = (): void => {
      if (!child.isDestroyed()) {
        child.destroy();
      }
    };
    const navigate = (_event: unknown, _url: string, sameDocument: boolean, mainFrame: boolean): void => {
      if (mainFrame && !sameDocument) {
        close();
      }
    };
    const dispose = (): void => {
      this.bindings.delete(childId);
      parent.removeListener('destroyed', close);
      parent.removeListener('render-process-gone', close);
      parent.removeListener('did-start-navigation', navigate);
      child.removeListener('closed', dispose);
    };
    this.bindings.set(childId, {parent, child, identity, dispose});
    parent.once('destroyed', close);
    parent.once('render-process-gone', close);
    parent.on('did-start-navigation', navigate);
    child.once('closed', dispose);
  }

  parentFor(child: WebContents): WebContents | undefined {
    const binding = this.bindings.get(child.id);
    if (
      !binding ||
      binding.child.isDestroyed() ||
      binding.child.webContents !== child ||
      binding.parent.isDestroyed() ||
      child.session !== binding.parent.session
    ) {
      return undefined;
    }
    try {
      const current = this.registry.authorize(
        {sender: binding.parent, senderFrame: binding.parent.mainFrame},
        DISPLAY_CAPTURE_CAPABILITY,
      );
      return current === binding.identity ? binding.parent : undefined;
    } catch {
      return undefined;
    }
  }

  dispose(): void {
    for (const binding of [...this.bindings.values()]) {
      if (!binding.child.isDestroyed()) {
        binding.child.destroy();
      }
      binding.dispose();
    }
  }
}
