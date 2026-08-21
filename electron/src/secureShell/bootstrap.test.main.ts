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

import {App} from 'electron';

import * as assert from 'assert';
import {EventEmitter} from 'events';

import {SecureShellBootstrapDependencies, SecureShellControllerLifecycle, startSecureShellProof} from './bootstrap';

const createHarness = (accountUrl: string | undefined = 'https://app.wire.test', failControllerStart = false) => {
  const events = new EventEmitter();
  let bindCount = 0;
  let createOptions: {accountId: string; accountPreload: string; accountUrl: string} | undefined;
  let disposeIpcCount = 0;
  let disposeProtocolCount = 0;
  let quitCount = 0;
  const errors: unknown[] = [];
  const controller: SecureShellControllerLifecycle & {
    disposeCount: number;
    showCount: number;
    startCount: number;
  } = {
    disposeCount: 0,
    showCount: 0,
    startCount: 0,
    dispose() {
      controller.disposeCount += 1;
    },
    show() {
      controller.showCount += 1;
    },
    async start() {
      controller.startCount += 1;
      if (failControllerStart) {
        throw new Error('controlled startup failure');
      }
    },
  };
  const app = {
    on: (event: string, listener: () => void) => events.on(event, listener),
    once: (event: string, listener: () => void) => events.once(event, listener),
    quit: () => {
      quitCount += 1;
    },
    whenReady: async () => {},
  } as unknown as App;
  const dependencies: SecureShellBootstrapDependencies = {
    bindIpc: () => {
      bindCount += 1;
      return () => {
        disposeIpcCount += 1;
      };
    },
    createController: options => {
      createOptions = options;
      return controller;
    },
    installProtocol: () => () => {
      disposeProtocolCount += 1;
    },
  };

  return {
    dependencies,
    emit: (event: string) => events.emit(event),
    getCounts: () => ({bindCount, disposeIpcCount, disposeProtocolCount, quitCount}),
    getCreateOptions: () => createOptions,
    controller,
    options: {
      accountPreload: '/fixed/preload.js',
      app,
      getAccountUrl: () => accountUrl,
      logger: {error: (_message: string, error: unknown) => errors.push(error)},
    },
    errors,
  };
};

describe('secure shell bootstrap', () => {
  it('[security-target][INV-002][INV-010][ARC-002] starts only the fixed secure-shell dependencies', async () => {
    const harness = createHarness();

    await startSecureShellProof(harness.options, harness.dependencies);

    assert.deepStrictEqual(harness.getCreateOptions(), {
      accountId: 'secure-shell-proof-account',
      accountPreload: '/fixed/preload.js',
      accountUrl: 'https://app.wire.test',
    });
    assert.strictEqual(harness.controller.startCount, 1);
    assert.strictEqual(harness.getCounts().bindCount, 1);
    harness.emit('activate');
    assert.strictEqual(harness.controller.showCount, 1);
    harness.emit('window-all-closed');
    assert.strictEqual(harness.getCounts().quitCount, 1);
    harness.emit('before-quit');
    assert.strictEqual(harness.controller.disposeCount, 1);
    assert.deepStrictEqual(harness.getCounts(), {
      bindCount: 1,
      disposeIpcCount: 1,
      disposeProtocolCount: 1,
      quitCount: 1,
    });
  });

  it('[security-target][INV-010][ARC-002] fails closed before installing authority without an account URL', async () => {
    const harness = createHarness('');

    await startSecureShellProof(harness.options, harness.dependencies);

    assert.strictEqual(harness.errors.length, 1);
    assert.deepStrictEqual(harness.getCounts(), {
      bindCount: 0,
      disposeIpcCount: 0,
      disposeProtocolCount: 0,
      quitCount: 1,
    });
  });

  it('[security-target][INV-010][ARC-002] revokes partial authority when controller startup fails', async () => {
    const harness = createHarness('https://app.wire.test', true);

    await startSecureShellProof(harness.options, harness.dependencies);

    assert.strictEqual(harness.errors.length, 1);
    assert.strictEqual(harness.controller.disposeCount, 1);
    assert.deepStrictEqual(harness.getCounts(), {
      bindCount: 1,
      disposeIpcCount: 1,
      disposeProtocolCount: 1,
      quitCount: 1,
    });
  });
});
