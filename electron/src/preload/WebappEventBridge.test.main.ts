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

import * as assert from 'assert';

import {createWebappEventBridge} from './WebappEventBridge';

describe('webapp event bridge', () => {
  it('[characterization][security-target][INV-002][SEC-005] maps every named event without exposing a generic sender', () => {
    const calls: Array<{args: unknown[]; name: string}> = [];
    const record =
      (name: string) =>
      (...args: unknown[]) =>
        calls.push({args, name});
    const bridge = createWebappEventBridge({
      activateNotification: record('activate'),
      changeEnvironment: record('environment'),
      closeSsoWindow: record('close-sso'),
      focusSsoWindow: record('focus-sso'),
      loaded: record('loaded'),
      relaunch: record('relaunch'),
      reload: record('reload'),
      reportVersions: record('versions'),
      sendSignedOut: record('signed-out'),
      sendSignOut: record('sign-out'),
      sendTeamInfo: record('team'),
      sendTheme: record('theme'),
      sendUnreadCount: record('unread'),
      updateDownloadPath: record('download'),
    });

    bridge.activateNotification();
    bridge.changeEnvironment('https://example.com');
    bridge.closeSsoWindow();
    bridge.focusSsoWindow();
    bridge.loaded();
    bridge.relaunch();
    bridge.reload();
    bridge.reportVersions({webappAVSVersion: 'avs', webappVersion: 'webapp'});
    bridge.signedOut(true);
    bridge.signOut();
    bridge.teamInfo({name: 'team'});
    bridge.theme('dark');
    bridge.unreadCount('2');
    bridge.updateDownloadPath('/downloads');

    assert.strictEqual(Object.isFrozen(bridge), true);
    assert.deepStrictEqual(
      calls.map(call => call.name),
      [
        'activate',
        'environment',
        'close-sso',
        'focus-sso',
        'loaded',
        'relaunch',
        'reload',
        'versions',
        'signed-out',
        'sign-out',
        'team',
        'theme',
        'unread',
        'download',
      ],
    );
  });
});
