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

import {WebAppEvents} from '@wireapp/webapp-events';

import {createWebappPreloadEvents, WebappPreloadEventActions} from './WebappPreloadEvents';

import {EVENT_TYPE} from '../lib/eventType';

describe('webapp preload event routing', () => {
  const createHarness = (sendAccountEvent?: (event: unknown) => void) => {
    const calls: Array<{args: unknown[]; name: string}> = [];
    const listeners = new Map<string, (event: unknown, ...args: unknown[]) => void>();
    let versions: {webappVersion: string} | undefined = {webappVersion: 'webapp'};
    const record =
      (name: string) =>
      (...args: unknown[]): void => {
        calls.push({args, name});
      };
    const actions: WebappPreloadEventActions = {
      activateNotification: record('activate'),
      closeSsoWindow: record('close-sso'),
      focusSsoWindow: record('focus-sso'),
      loaded: markThemeLoaded => {
        record('loaded')();
        markThemeLoaded();
      },
      relaunch: record('relaunch'),
      reload: record('reload'),
      reportVersions: record('versions'),
      updateDownloadPath: record('download'),
    };
    const preloadEvents = createWebappPreloadEvents({
      sendAccountEvent,
      actions,
      ipc: {
        on: (channel, listener) => listeners.set(channel, listener),
        sendToHost: (channel, ...args) => record(`host:${channel}`)(...args),
      },
      logger: {info: record('log')},
      mainWorld: {
        dispatch: (name, detail) => record(`dispatch:${name}`)(detail),
        install: record('install'),
        publish: (name, ...args) => record(`publish:${name}`)(...args),
        publishUpdate: record('update'),
        readVersions: () => versions,
        setLocationHash: record('hash'),
      },
    });
    const emit = (channel: string, ...args: unknown[]): void => {
      const listener = listeners.get(channel);
      assert.ok(listener, `missing listener for ${channel}`);
      listener({}, ...args);
    };
    return {calls, emit, preloadEvents, setVersions: (value: typeof versions) => (versions = value)};
  };

  it('[compatibility][CAP-001] routes named native-account events without depending on a webview host', () => {
    const events: unknown[] = [];
    const {calls, emit, preloadEvents} = createHarness(event => events.push(event));
    preloadEvents.subscribeToMainProcessEvents();
    preloadEvents.events.activateNotification();
    preloadEvents.events.changeEnvironment('https://custom.wire.test/');
    preloadEvents.events.loaded();
    preloadEvents.events.signedOut(false);
    preloadEvents.events.signOut();
    preloadEvents.events.teamInfo({name: 'Account'});
    preloadEvents.events.theme('dark');
    preloadEvents.events.unreadCount(3);
    emit(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code: 'code', key: 'key'});
    assert.deepStrictEqual(events, [
      {type: 'activate'},
      {type: 'environment', url: 'https://custom.wire.test/'},
      {type: 'loaded'},
      {type: 'signed-out', clearData: false},
      {type: 'sign-out'},
      {type: 'metadata', data: {name: 'Account'}},
      {type: 'theme', theme: 'dark'},
      {type: 'unread', count: 3},
      {type: 'join', code: 'code', key: 'key', domain: undefined},
    ]);
    assert.equal(
      calls.some(call => call.name.startsWith('host:')),
      false,
    );
  });

  it('[regression][CAP-001][CAP-006] delivers non-federated conversation joins using the webapp domain fallback', () => {
    for (const data of [
      {code: 'code', key: 'key'},
      {code: 'code', key: 'key', domain: null},
    ]) {
      const {calls, emit, preloadEvents} = createHarness();
      preloadEvents.subscribeToMainProcessEvents();
      emit(WebAppEvents.CONVERSATION.JOIN, data);
      const delivered = calls.filter(call => call.name === `dispatch:${WebAppEvents.CONVERSATION.JOIN}`);
      assert.deepStrictEqual(
        delivered.map(call => call.args[0]),
        [{...data, domain: data.domain}],
      );
    }
    for (const domain of [42, {}, []]) {
      const {calls, emit, preloadEvents} = createHarness();
      preloadEvents.subscribeToMainProcessEvents();
      emit(WebAppEvents.CONVERSATION.JOIN, {code: 'code', key: 'key', domain});
      assert.equal(
        calls.some(call => call.name === `dispatch:${WebAppEvents.CONVERSATION.JOIN}`),
        false,
      );
    }
  });

  it('[characterization][security-target][INV-002][SEC-005] preserves named webapp-to-shell capabilities', () => {
    const {calls, preloadEvents} = createHarness();

    preloadEvents.events.activateNotification();
    preloadEvents.events.changeEnvironment('https://example.com');
    preloadEvents.events.changeEnvironment(undefined);
    preloadEvents.events.closeSsoWindow();
    preloadEvents.events.focusSsoWindow();
    preloadEvents.events.loaded();
    preloadEvents.events.relaunch();
    preloadEvents.events.reload();
    preloadEvents.events.reportVersions({webappVersion: 'reported'});
    preloadEvents.events.signedOut(true);
    preloadEvents.events.signOut();
    preloadEvents.events.teamInfo({name: 'Wire'});
    preloadEvents.events.theme('dark');
    preloadEvents.events.unreadCount(2);
    preloadEvents.events.updateDownloadPath('/downloads');
    preloadEvents.events.updateDownloadPath(undefined);
    preloadEvents.events.updateDownloadPath(42);
    preloadEvents.receiveTheme(true);

    const names = calls.map(call => call.name);
    for (const expected of [
      'activate',
      'close-sso',
      'focus-sso',
      'loaded',
      'relaunch',
      'reload',
      'versions',
      'download',
      `host:${EVENT_TYPE.WRAPPER.NAVIGATE_WEBVIEW}`,
      `host:${EVENT_TYPE.LIFECYCLE.SIGNED_IN}`,
      `host:${EVENT_TYPE.LIFECYCLE.SIGNED_OUT}`,
      `host:${EVENT_TYPE.ACCOUNT.UPDATE_INFO}`,
      `host:${EVENT_TYPE.LIFECYCLE.UNREAD_COUNT}`,
      `publish:${WebAppEvents.PROPERTIES.UPDATE.INTERFACE.USE_DARK_MODE}`,
    ]) {
      assert.ok(names.includes(expected), `missing ${expected}`);
    }
    assert.deepStrictEqual(
      names.filter(name =>
        ['activate', 'close-sso', 'focus-sso', 'loaded', 'relaunch', 'reload', 'versions', 'download'].includes(name),
      ),
      ['activate', 'close-sso', 'focus-sso', 'loaded', 'relaunch', 'reload', 'versions', 'download', 'download'],
    );
    assert.strictEqual(calls.filter(call => call.name === 'download').length, 2);
  });

  it('[characterization][security-target][INV-002][SEC-005] preserves validated main-to-webapp routing', () => {
    const {calls, emit, preloadEvents, setVersions} = createHarness();
    preloadEvents.subscribeToMainProcessEvents();

    for (const channel of [
      EVENT_TYPE.CONVERSATION.ADD_PEOPLE,
      EVENT_TYPE.CONVERSATION.ARCHIVE,
      EVENT_TYPE.CONVERSATION.CALL,
      EVENT_TYPE.CONVERSATION.DELETE,
      EVENT_TYPE.CONVERSATION.SHOW_NEXT,
      EVENT_TYPE.CONVERSATION.PEOPLE,
      EVENT_TYPE.CONVERSATION.PING,
      EVENT_TYPE.CONVERSATION.SHOW_PREVIOUS,
      EVENT_TYPE.CONVERSATION.TOGGLE_MUTE,
      EVENT_TYPE.CONVERSATION.START,
      EVENT_TYPE.CONVERSATION.SEARCH,
      EVENT_TYPE.CONVERSATION.VIDEO_CALL,
      EVENT_TYPE.PREFERENCES.SHOW,
      EVENT_TYPE.ACTION.SIGN_OUT,
      WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED,
    ]) {
      emit(channel);
    }
    emit(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, '#conversation');
    emit(EVENT_TYPE.WEBAPP.CHANGE_LOCATION_HASH, 42);
    emit(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION);
    setVersions(undefined);
    emit(EVENT_TYPE.UI.REQUEST_WEBAPP_VERSION);
    emit(EVENT_TYPE.WRAPPER.UPDATE_AVAILABLE);
    emit(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code: 'code', key: 'key'});
    emit(EVENT_TYPE.ACTION.JOIN_CONVERSATION, {code: 1, key: 'key'});
    emit(WebAppEvents.CONVERSATION.JOIN, {code: 'code', domain: 'example.com', key: 'key'});
    emit(WebAppEvents.CONVERSATION.JOIN, null);

    const names = calls.map(call => call.name);
    assert.deepStrictEqual(
      names.filter(name => name.startsWith('publish:')),
      [
        WebAppEvents.SHORTCUT.ADD_PEOPLE,
        WebAppEvents.SHORTCUT.ARCHIVE,
        WebAppEvents.CALL.STATE.TOGGLE,
        WebAppEvents.SHORTCUT.DELETE,
        WebAppEvents.SHORTCUT.NEXT,
        WebAppEvents.SHORTCUT.PEOPLE,
        WebAppEvents.SHORTCUT.PING,
        WebAppEvents.SHORTCUT.PREV,
        WebAppEvents.SHORTCUT.SILENCE,
        WebAppEvents.SHORTCUT.START,
        WebAppEvents.SHORTCUT.SEARCH,
        WebAppEvents.CALL.STATE.TOGGLE,
        WebAppEvents.PREFERENCES.MANAGE_ACCOUNT,
        WebAppEvents.LIFECYCLE.ASK_TO_CLEAR_DATA,
        WebAppEvents.LIFECYCLE.SSO_WINDOW_CLOSED,
      ].map(name => `publish:${name}`),
    );
    assert.ok(names.includes('hash'));
    assert.ok(names.includes('versions'));
    assert.ok(names.includes('update'));
    assert.ok(names.includes(`host:${EVENT_TYPE.ACTION.JOIN_CONVERSATION}`));
    assert.ok(names.includes(`dispatch:${WebAppEvents.CONVERSATION.JOIN}`));
    assert.strictEqual(calls.filter(call => call.name === 'hash').length, 1);
    assert.strictEqual(calls.filter(call => call.name === 'versions').length, 1);
    assert.strictEqual(calls.filter(call => call.name === `host:${EVENT_TYPE.ACTION.JOIN_CONVERSATION}`).length, 1);
    assert.strictEqual(calls.filter(call => call.name === `dispatch:${WebAppEvents.CONVERSATION.JOIN}`).length, 1);
  });
});
