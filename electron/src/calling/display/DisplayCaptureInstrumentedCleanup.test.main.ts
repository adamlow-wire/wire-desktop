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

import {stub} from 'sinon';

import {strict as assert} from 'node:assert';
import {createRequire} from 'node:module';
import path from 'node:path';

const requireCjs = createRequire(path.resolve('package.json'));
let localClosedPorts = 0;

interface CleanupFlow {
  id: string;
  phase: string;
  selected?: object;
  sourceChoices: Map<string, object>;
  cleanup: Array<() => void>;
  identity: {mainFrame: object};
  owner: {isDestroyed(): boolean; mainFrame: object};
  window: {isDestroyed(): boolean; destroy(): void};
  reject(error: Error): void;
}

interface DirectCoordinator {
  flows: Map<string, CleanupFlow>;
  pendingCleanup: Map<string, CleanupFlow>;
  cleaning: Set<string>;
  end(flow: CleanupFlow): void;
  select(flow: CleanupFlow, choiceId: string): Promise<void>;
  options?: object;
}

// electron-mocha imports the instrumented production module directly. Local Node verification
// supplies only top-level native dependencies; it executes that same class and method body.
function loadCoordinator(): typeof import('./DisplayCaptureCoordinator').DisplayCaptureCoordinator {
  if (process.versions.electron) {
    return requireCjs('./electron/src/calling/display/DisplayCaptureCoordinator.ts').DisplayCaptureCoordinator;
  }
  const loader = requireCjs('node:module') as {
    _load: (request: string, parent: {filename?: string} | undefined, isMain: boolean) => unknown;
  };
  const originalLoad = loader._load.bind(loader);
  loader._load = (request, parent, isMain) => {
    const directImport = parent?.filename?.endsWith('/electron/src/calling/display/DisplayCaptureCoordinator.ts');
    if (directImport && request === 'electron') {
      return {
        MessageChannelMain: class {
          port1 = {
            close: () => {
              localClosedPorts += 1;
            },
          };
          port2 = {
            close: () => {
              localClosedPorts += 1;
            },
          };
        },
      };
    }
    if (directImport && request === '../../security/LocalContentPolicy') {
      return {LOCAL_CONTENT_ORIGIN: 'wire-app://shell'};
    }
    if (
      directImport &&
      [
        '../../locale',
        '../../security/AuthorizedIpc',
        '../../security/LocalContentProtocol',
        '../../security/NavigationGuard',
        '../../security/ViewIdentityRegistry',
      ].includes(request)
    ) {
      return {};
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    return requireCjs('./electron/src/calling/display/DisplayCaptureCoordinator.ts').DisplayCaptureCoordinator;
  } finally {
    loader._load = originalLoad;
  }
}

describe('[TST-006][CAP-003] instrumented capture cleanup ownership', function () {
  this.timeout(10000);
  it('[security-target] closes still-owned ports when the broker transfer fails', async () => {
    localClosedPorts = 0;
    const Coordinator = loadCoordinator();
    const coordinator = Object.assign(Object.create(Coordinator.prototype) as object, {
      flows: new Map<string, CleanupFlow>(),
      pendingCleanup: new Map<string, CleanupFlow>(),
      cleaning: new Set<string>(),
    }) as DirectCoordinator;
    const calls: string[] = [];
    const mainFrame = {postMessage: () => calls.push('ended-notice')};
    const identity = {mainFrame};
    let destroyed = false;
    const flow = {
      id: 'owned-flow',
      requestId: 'owned-request',
      phase: 'choosing',
      selected: undefined,
      sourceChoices: new Map([['owned-source', {video: {id: 'synthetic-source'}}]]),
      cleanup: [] as Array<() => void>,
      identity,
      owner: {isDestroyed: () => false, mainFrame},
      window: {
        isDestroyed: () => destroyed,
        destroy: () => {
          destroyed = true;
          calls.push('destroy');
        },
        isFocused: () => true,
        webContents: {
          mainFrame: {
            postMessage: () => {
              throw new Error('synthetic broker transfer failure');
            },
          },
        },
      },
      reject: (error: Error) => {
        assert.equal(error.message, 'Display capture was cancelled or ended.');
        calls.push('rejected');
      },
    };
    coordinator.options = {
      registry: {authorize: () => identity},
      isEligible: () => true,
      canApprove: () => true,
    };
    coordinator.flows.set(flow.id, flow);
    await assert.rejects(coordinator.select(flow, 'owned-source'), /Display source did not start/);
    assert.equal(destroyed, true);
    assert.equal(flow.phase, 'ended');
    assert.equal(coordinator.flows.has(flow.id), false);
    assert.equal(coordinator.pendingCleanup.has(flow.id), false);
    assert.equal(flow.cleanup.length, 0);
    assert.equal(coordinator.cleaning.size, 0);
    if (!process.versions.electron) {
      assert.equal(localClosedPorts, 2, 'Both main-owned endpoints must close after failed transfer.');
    }
    assert.deepEqual(calls, ['rejected', 'ended-notice', 'destroy']);
  });

  it('[security-target] retains failed cleanup, retries once, and withholds ended notice from a destroyed owner', () => {
    const Coordinator = loadCoordinator();
    const coordinator = Object.assign(Object.create(Coordinator.prototype) as object, {
      flows: new Map<string, CleanupFlow>(),
      pendingCleanup: new Map<string, CleanupFlow>(),
      cleaning: new Set<string>(),
    }) as DirectCoordinator;
    const calls: string[] = [];
    let failCleanup = true;
    const mainFrame = {postMessage: () => calls.push('ended-notice')};
    const flow: CleanupFlow = {
      id: 'owned-flow',
      phase: 'active',
      selected: {},
      sourceChoices: new Map([['owned-source', {}]]),
      cleanup: [
        () => {
          calls.push('cleanup');
          if (failCleanup) {
            throw new Error('synthetic-secret-must-not-be-logged');
          }
        },
      ],
      identity: {mainFrame},
      owner: {isDestroyed: () => true, mainFrame},
      window: {isDestroyed: () => true, destroy: () => calls.push('destroy')},
      reject: error => {
        assert.equal(error.message, 'Display capture was cancelled or ended.');
        calls.push('rejected');
      },
    };
    coordinator.flows.set(flow.id, flow);
    const warning = stub(console, 'warn');
    try {
      coordinator.end(flow);
      assert.equal(flow.phase, 'ended');
      assert.equal(coordinator.flows.has(flow.id), false);
      assert.equal(coordinator.pendingCleanup.get(flow.id), flow);
      assert.equal(flow.cleanup.length, 1);
      assert.equal(flow.sourceChoices.size, 0);
      assert.equal(flow.selected, undefined);
      assert.deepEqual(calls, ['rejected', 'cleanup']);
      assert.equal(warning.calledOnceWithExactly('Display capture cleanup failed.'), true);

      failCleanup = false;
      coordinator.end(flow);
      assert.equal(coordinator.pendingCleanup.has(flow.id), false);
      assert.equal(flow.cleanup.length, 0);
      assert.deepEqual(calls, ['rejected', 'cleanup', 'cleanup']);
      assert.equal(warning.callCount, 1);
      assert.equal(coordinator.cleaning.size, 0);
    } finally {
      warning.restore();
    }
  });
});
