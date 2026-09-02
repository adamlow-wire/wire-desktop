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

import {strict as assert} from 'assert';

import {registerDeveloperToolViewIdentity} from './DeveloperToolViewIdentity';
import {ViewIdentityRegistry} from './ViewIdentityRegistry';

describe('developer tool view identity', () => {
  it('[security-target][INV-003][INV-004][SEC-002] binds WebRTC internals to its exact opaque URL and session', () => {
    const registry = new ViewIdentityRegistry();
    const listeners = new Map<string, () => void>();
    const session = {};
    const webContents = {
      id: 88,
      isDestroyed: () => false,
      mainFrame: {url: 'chrome://webrtc-internals/'},
      once(event: 'destroyed' | 'render-process-gone', listener: () => void) {
        listeners.set(event, listener);
        return this;
      },
      session,
    };

    const registered = registerDeveloperToolViewIdentity(registry, webContents);

    assert.strictEqual(registered.identity.allowedOrigin, 'null');
    assert.strictEqual(registered.identity.allowedUrl, 'chrome://webrtc-internals/');
    assert.strictEqual(registered.identity.capabilities.length, 0);
    assert.strictEqual(registered.identity.session, session);
    assert.strictEqual(registered.identity.viewType, 'developer-tool');
    assert.strictEqual(registry.has(webContents.id), true);

    listeners.get('destroyed')?.();
    assert.strictEqual(registry.has(webContents.id), false);
  });
});
