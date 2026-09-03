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

import {DESKTOP_SOURCES_ENUMERATE_CAPABILITY} from './DesktopSourcesContract';
import {DOWNLOAD_LOCATION_UPDATE_CAPABILITY} from './DownloadLocationContract';
import {getLegacyAccountPartition, registerLegacyAccountViewIdentity} from './LegacyAccountViewIdentity';
import {MANAGED_CONFIG_CAPABILITY} from './ManagedConfigContract';
import {NOTIFICATION_ACTIVATION_CAPABILITY} from './NotificationActivationContract';
import {OPEN_GRAPH_FETCH_CAPABILITY} from './OpenGraphContract';
import {SAFE_STORAGE_DECRYPT_CAPABILITY, SAFE_STORAGE_ENCRYPT_CAPABILITY} from './SafeStorageContract';
import {SAVE_PICTURE_CAPABILITY} from './SavePictureContract';
import {SSO_WINDOW_CLOSE_CAPABILITY, SSO_WINDOW_FOCUS_CAPABILITY} from './SsoWindowControlContract';
import {ViewIdentityRegistry} from './ViewIdentityRegistry';
import {WEBAPP_LOADED_CAPABILITY} from './WebAppLoadedContract';
import {WRAPPER_RELAUNCH_CAPABILITY} from './WrapperRelaunchContract';
import {WRAPPER_RELOAD_CAPABILITY} from './WrapperReloadContract';

const accountId = '6f350266-15de-4cab-b38c-9f986fdc6b18';

const createWebContents = () => {
  const listeners = new Map<string, () => void>();
  const session = {};
  const mainFrame = {url: `https://app.example.test/?id=${accountId}`};
  return {
    contents: {
      id: 42,
      isDestroyed: () => false,
      mainFrame,
      once(event: 'destroyed' | 'render-process-gone', listener: () => void) {
        listeners.set(event, listener);
        return this;
      },
      session,
    },
    emit(event: 'destroyed' | 'render-process-gone') {
      listeners.get(event)?.();
    },
    mainFrame,
    session,
  };
};

describe('registerLegacyAccountViewIdentity', () => {
  it('[security-target][INV-003][INV-004][SEC-002][SEC-003] derives only default or UUID account partitions', () => {
    const defaultSession = {storagePath: '/tmp/default'};

    assert.strictEqual(getLegacyAccountPartition(defaultSession, defaultSession), 'default');
    assert.strictEqual(
      getLegacyAccountPartition({storagePath: `/tmp/Partitions/${accountId}`}, defaultSession),
      accountId,
    );
    assert.strictEqual(
      getLegacyAccountPartition({storagePath: '/tmp/Partitions/not-a-uuid'}, defaultSession),
      undefined,
    );
    assert.strictEqual(getLegacyAccountPartition({storagePath: null}, defaultSession), undefined);
  });

  it('[security-target][INV-003][INV-004][SEC-002] binds an exact account, origin, session, frame, and lifecycle', () => {
    const registry = new ViewIdentityRegistry();
    const view = createWebContents();

    const registered = registerLegacyAccountViewIdentity(
      registry,
      view.contents,
      `https://app.example.test/?id=${accountId}`,
      'persist:legacy-session',
    );

    assert.ok(registered);
    assert.strictEqual(registered.identity.accountId, accountId);
    assert.strictEqual(registered.identity.allowedOrigin, 'https://app.example.test');
    assert.deepStrictEqual(registered.identity.capabilities, [
      SAFE_STORAGE_ENCRYPT_CAPABILITY,
      SAFE_STORAGE_DECRYPT_CAPABILITY,
      MANAGED_CONFIG_CAPABILITY,
      SAVE_PICTURE_CAPABILITY,
      NOTIFICATION_ACTIVATION_CAPABILITY,
      WEBAPP_LOADED_CAPABILITY,
      WRAPPER_RELOAD_CAPABILITY,
      WRAPPER_RELAUNCH_CAPABILITY,
      OPEN_GRAPH_FETCH_CAPABILITY,
      DOWNLOAD_LOCATION_UPDATE_CAPABILITY,
      DESKTOP_SOURCES_ENUMERATE_CAPABILITY,
      SSO_WINDOW_CLOSE_CAPABILITY,
      SSO_WINDOW_FOCUS_CAPABILITY,
    ]);
    assert.strictEqual(registered.identity.mainFrame, view.mainFrame);
    assert.strictEqual(registered.identity.partition, 'persist:legacy-session');
    assert.strictEqual(registered.identity.session, view.session);
    assert.strictEqual(registry.has(view.contents.id), true);

    view.emit('render-process-gone');
    assert.strictEqual(registry.has(view.contents.id), false);
  });

  for (const url of [
    'not a URL',
    'https://app.example.test/',
    'https://app.example.test/?id=renderer-chosen-account',
    `file:///tmp/account.html?id=${accountId}`,
  ]) {
    it(`[security-target][INV-003][INV-010][SEC-002] rejects an account identity from ${url}`, () => {
      const registry = new ViewIdentityRegistry();
      const view = createWebContents();

      assert.strictEqual(registerLegacyAccountViewIdentity(registry, view.contents, url, 'default'), undefined);
      assert.strictEqual(registry.has(view.contents.id), false);
    });
  }
});
