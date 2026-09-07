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

import {WebappEventBridge} from './WebappEventBridge';
import {createWebappMainWorld, installWebappEventAdapter, WEBAPP_EVENT_NAMES} from './WebappMainWorld';

describe('webapp main-world adapter', () => {
  const host = globalThis as unknown as {window?: unknown};
  const originalWindow = host.window;

  afterEach(() => {
    host.window = originalWindow;
  });

  it('[security-target][INV-002][SEC-005] registers fixed Wire subscriptions against named bridge methods', () => {
    const subscriptions = new Map<string, (...args: unknown[]) => void>();
    const calls: string[] = [];
    const eventBridge = new Proxy(
      {},
      {
        get:
          (_target, name: string) =>
          (..._args: unknown[]) =>
            calls.push(name),
      },
    ) as WebappEventBridge;
    const fakeWindow = {
      addEventListener: (name: string, listener: (event?: unknown) => void) => {
        if (name === 'DOMContentLoaded') {
          listener();
        }
      },
      amplify: {
        publish: () => undefined,
        subscribe: (name: string, listener: (...args: unknown[]) => void) => subscriptions.set(name, listener),
        unsubscribe: () => undefined,
      },
      close: () => calls.push('close'),
      setTimeout: () => {
        throw new Error('adapter unexpectedly retried');
      },
      wire: {},
      wireDesktopBridge: {events: eventBridge},
      z: {
        event: {},
        lifecycle: {UPDATE_SOURCE: {DESKTOP: 'desktop'}},
        util: {Environment: {avsVersion: () => 'avs', version: () => 'webapp'}},
      },
    };
    host.window = fakeWindow;

    installWebappEventAdapter(WEBAPP_EVENT_NAMES);

    assert.ok(subscriptions.has(WebAppEvents.LIFECYCLE.LOADED));
    assert.ok(subscriptions.has(WebAppEvents.LIFECYCLE.REFRESH));
    assert.ok(subscriptions.has(WebAppEvents.TEAM.INFO));
    assert.ok(calls.includes('reportVersions'));
    subscriptions.get(WebAppEvents.LIFECYCLE.LOADED)?.();
    assert.ok(calls.includes('loaded'));
    fakeWindow.close();
    assert.ok(!calls.includes('close'));
  });

  it('[security-target][INV-002][SEC-005] executes only fixed main-world functions', () => {
    const scripts: Electron.ExecutionScript[] = [];
    const mainWorld = createWebappMainWorld({
      executeInMainWorld: script => {
        scripts.push(script);
        return script.func === scripts[4]?.func ? {webappVersion: 'webapp'} : undefined;
      },
    });

    mainWorld.dispatch('join', {code: 'code'});
    mainWorld.install();
    mainWorld.publish('shortcut', true);
    mainWorld.publishUpdate();
    mainWorld.readVersions();
    mainWorld.setLocationHash('#conversation');

    assert.strictEqual(scripts.length, 6);
    assert.deepStrictEqual(scripts[0].args, ['join', {code: 'code'}]);
    assert.deepStrictEqual(scripts[2].args, ['shortcut', [true]]);
    assert.deepStrictEqual(scripts[5].args, ['#conversation']);
  });
});
