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

import {strict as assert} from 'node:assert';
import {EventEmitter} from 'node:events';

import {DISPLAY_CAPTURE_CAPABILITY} from './display/DisplayCaptureContract';
import {PictureInPictureOwners} from './PictureInPictureOwners';

import {ViewIdentityRegistry} from '../security/ViewIdentityRegistry';

const fixture = () => {
  const registry = new ViewIdentityRegistry();
  const target = {};
  const parent = Object.assign(new EventEmitter(), {
    id: 1,
    session: target,
    mainFrame: {url: 'https://fixture.example/call'},
    isDestroyed: () => false,
  }) as unknown as WebContents;
  const register = () =>
    registry.register({
      accountId: 'account',
      allowedOrigin: 'https://fixture.example',
      capabilities: [DISPLAY_CAPTURE_CAPABILITY],
      partition: 'fixture',
      session: target,
      viewType: 'account',
      webContents: parent,
    });
  register();
  const makeChild = (id: number, session = target) => {
    let destroyed = false;
    const contents = {
      id,
      session,
      mainFrame: {url: 'about:blank'},
      isDestroyed: () => destroyed,
    } as unknown as WebContents;
    const child = Object.assign(new EventEmitter(), {
      webContents: contents,
      isDestroyed: () => destroyed,
      destroy: () => {
        destroyed = true;
        child.emit('closed');
      },
    }) as unknown as BrowserWindow;
    return child;
  };
  return {registry, parent, register, makeChild, owners: new PictureInPictureOwners(registry)};
};

describe('[security-target][CAP-003] detached call parent ownership', () => {
  it('resolves only the exact child and releases parent listeners when it closes', () => {
    const {owners, parent, makeChild} = fixture();
    const child = makeChild(2);
    owners.bind(parent, child);
    assert.equal(owners.parentFor(child.webContents), parent);
    assert.equal(owners.parentFor(makeChild(2).webContents), undefined);
    child.destroy();
    assert.equal(owners.parentFor(child.webContents), undefined);
    assert.equal(parent.listenerCount('did-start-navigation'), 0);
    assert.equal(parent.listenerCount('destroyed'), 0);
    assert.equal(parent.listenerCount('render-process-gone'), 0);
    owners.dispose();
  });

  for (const event of ['destroyed', 'render-process-gone', 'did-start-navigation'] as const) {
    it(`closes the detached call when its parent reports ${event}`, () => {
      const {owners, parent, makeChild} = fixture();
      const child = makeChild(2);
      owners.bind(parent, child);
      parent.emit(event, {}, 'https://fixture.example/replacement', false, true);
      assert.equal(child.isDestroyed(), true);
      assert.equal(owners.parentFor(child.webContents), undefined);
    });
  }

  it('keeps a child across same-document and subframe navigation but closes it on disposal', () => {
    const {owners, parent, makeChild} = fixture();
    const child = makeChild(2);
    owners.bind(parent, child);
    parent.emit('did-start-navigation', {}, 'https://fixture.example/call#hash', true, true);
    parent.emit('did-start-navigation', {}, 'https://fixture.example/frame', false, false);
    assert.equal(child.isDestroyed(), false);
    owners.dispose();
    owners.dispose();
    assert.equal(child.isDestroyed(), true);
    assert.equal(parent.listenerCount('did-start-navigation'), 0);
  });

  it('rejects another session and an overlapping detached call without replacing the existing owner', () => {
    const {owners, parent, makeChild} = fixture();
    assert.throws(() => owners.bind(parent, makeChild(2, {})));
    const child = makeChild(3);
    owners.bind(parent, child);
    assert.throws(() => owners.bind(parent, makeChild(4)));
    assert.equal(owners.parentFor(child.webContents), parent);
    owners.dispose();
  });

  it('does not retain authority after parent registration is revoked or replaced', () => {
    const {owners, parent, makeChild, registry, register} = fixture();
    const child = makeChild(2);
    owners.bind(parent, child);
    registry.unregister(parent.id);
    assert.equal(owners.parentFor(child.webContents), undefined);
    register();
    assert.equal(owners.parentFor(child.webContents), undefined);
    owners.dispose();
  });
});
