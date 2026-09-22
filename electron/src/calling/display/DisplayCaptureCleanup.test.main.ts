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

import * as ts from 'typescript';

import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';

interface Flow {
  id: string;
  requestId: string;
  identity: {accountId: string; mainFrame: object};
  owner: object;
  window: object;
  phase: string;
  sourceChoices: Map<string, object>;
  selected?: object;
  cleanup: Array<() => void>;
  reject(error: Error): void;
  resolve(value: unknown): void;
  displayUsed?: boolean;
}
interface Coordinator {
  options: object;
  flows: Map<string, Flow>;
  select(flow: Flow, choiceId: string): Promise<void>;
  revalidate(): void;
  dispose(): void;
  begin(identity: Flow['identity'], request: {requestId: string}): unknown;
}

const fixture = (failureStage?: string) => {
  const filename = path.resolve('electron/src/calling/display/DisplayCaptureCoordinator.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements
    .filter(ts.isClassDeclaration)
    .find(node => node.name?.text === 'DisplayCaptureCoordinator')!;
  // Execute actual fields/methods while omitting only native IPC constructor binding.
  const isolated = ts.factory.updateClassDeclaration(
    declaration,
    undefined,
    declaration.name,
    declaration.typeParameters,
    declaration.heritageClauses,
    declaration.members.filter(node => !ts.isConstructorDeclaration(node)),
  );
  const compiled = ts.transpileModule(
    `${ts.createPrinter().printNode(ts.EmitHint.Unspecified, isolated, source)}\nDisplayCaptureCoordinator;`,
    {
      compilerOptions: {target: ts.ScriptTarget.ES2022},
    },
  ).outputText;
  const diagnostics: unknown[][] = [];
  const ports = [0, 1].map(() => ({
    transferred: false,
    closed: false,
    close() {
      assert.equal(this.transferred, false, 'Main must not close a transferred endpoint.');
      this.closed = true;
    },
  }));
  const Constructor = runInNewContext(compiled, {
    clearTimeout: () => undefined,
    setTimeout: () => 1,
    DISPLAY_CAPTURE_LIMITS: {frameTimeoutMs: 1000},
    DISPLAY_BROKER_PORT_CHANNEL: 'broker-port-fixture',
    DISPLAY_CAPTURE_PORT_CHANNEL: 'owner-port-fixture',
    MessageChannelMain: class {
      port1 = ports[0];
      port2 = ports[1];
      constructor() {
        check('channel');
      }
    },
    DISPLAY_CAPTURE_ENDED_CHANNEL: 'ended-fixture',
    DISPLAY_CAPTURE_CAPABILITY: 'capture-fixture',
    console: {warn: (...args: unknown[]) => diagnostics.push(args)},
    session: {
      fromPartition: () => {
        throw new Error('Unexpected native allocation.');
      },
    },
    randomUUID: () => 'fixture',
  }) as new () => Coordinator;
  const coordinator = new Constructor();
  let stage = failureStage;
  const failure = new Error('Owned cleanup detail must not reach diagnostics.');
  const calls: string[] = [];
  let destroyed = false;
  const check = (name: string) => {
    calls.push(name);
    if (stage === name) {
      throw failure;
    }
  };
  const frame = {
    postMessage: (channel: string) => {
      if (channel === 'owner-port-fixture') {
        check('owner-transfer');
        ports[1].transferred = true;
      } else {
        check('notify');
      }
    },
  };
  const identity = {accountId: 'owned-account', mainFrame: frame};
  const flow: Flow = {
    id: 'owned-flow',
    requestId: 'owned-request',
    identity,
    owner: {isDestroyed: () => false, mainFrame: frame},
    window: {
      isDestroyed: () => destroyed,
      destroy: () => {
        check('destroy');
        destroyed = true;
      },
    },
    phase: 'choosing',
    sourceChoices: new Map([['source', {}]]),
    selected: {},
    cleanup: ['uninstall', 'revoke', 'listeners'].map(name => () => check(name)),
    reject: error => {
      assert.equal(error.message, 'Display capture was cancelled or ended.');
      calls.push('denied');
    },
    resolve: () => {
      calls.push('started');
    },
  };
  Object.assign(flow.window, {
    isFocused: () => true,
    setParentWindow: () => check('detach-parent'),
    webContents: {
      mainFrame: {
        postMessage: () => {
          check('broker-transfer');
          ports[0].transferred = true;
        },
      },
      executeJavaScript: async () => {
        check('start');
        flow.displayUsed = true;
        return true;
      },
    },
  });
  coordinator.options = {
    registry: {authorize: () => identity},
    isEligible: () => true,
    canApprove: () => false,
    isForeground: () => true,
    parentWindow: () => ({isDestroyed: () => false, isVisible: () => true, isMinimized: () => false}),
  };
  coordinator.flows.set(flow.id, flow);
  return {
    coordinator,
    flow,
    calls,
    diagnostics,
    ports,
    destroyed: () => destroyed,
    recover: () => {
      stage = undefined;
    },
  };
};

describe('[CAP-003][INV-006][INV-010] capture teardown ownership with inert native ports', () => {
  it('ends a normal flow once and ignores unavailable owner notification', () => {
    const f = fixture('notify');
    f.coordinator.revalidate();
    assert.equal(f.flow.phase, 'ended');
    assert.equal(f.coordinator.flows.size, 0);
    assert.equal(f.destroyed(), true);
    assert.equal(f.flow.sourceChoices.size, 0);
    assert.equal(f.calls.filter(value => value === 'denied').length, 1);
    f.coordinator.dispose();
    assert.equal(f.calls.filter(value => value === 'denied').length, 1);
  });
  for (const stage of ['destroy', 'listeners', 'revoke', 'uninstall']) {
    it(`finishes cancellation and retries owned cleanup after ${stage} fails`, () => {
      const f = fixture(stage);
      assert.doesNotThrow(() => f.coordinator.revalidate());
      for (const step of ['destroy', 'listeners', 'revoke', 'uninstall', 'denied']) {
        assert.equal(f.calls.filter(value => value === step).length, 1, step);
      }
      assert.equal(f.flow.phase, 'ended');
      assert.equal(f.coordinator.flows.size, 0);
      assert.equal(f.flow.sourceChoices.size, 0);
      assert.equal(f.flow.selected, undefined);
      assert.deepEqual(f.diagnostics, [['Display capture cleanup failed.']]);
      assert.throws(() => f.coordinator.begin(f.flow.identity, {requestId: 'replacement'}), /not available/);
      f.recover();
      f.coordinator.dispose();
      assert.equal(f.destroyed(), true);
      assert.equal(f.calls.filter(value => value === stage).length, 2);
      assert.equal(f.calls.filter(value => value === 'denied').length, 1);
      assert.equal(f.flow.cleanup.length, 0);
      assert.throws(
        () => f.coordinator.begin(f.flow.identity, {requestId: 'replacement'}),
        /Unexpected native allocation/,
      );
    });
  }
  it('retries retained cleanup during revalidation even after approval eligibility returns', () => {
    const f = fixture('destroy');
    f.coordinator.revalidate();
    f.recover();
    Object.assign(f.coordinator.options, {canApprove: () => true});
    f.coordinator.revalidate();
    assert.equal(f.destroyed(), true);
    assert.equal(f.calls.filter(value => value === 'denied').length, 1);
  });
  it('counts retained failed cleanup against the global four-flow capacity', () => {
    const f = fixture('destroy');
    for (let index = 1; index < 4; index++) {
      const extra = {
        ...f.flow,
        id: `flow-${index}`,
        identity: {...f.flow.identity, accountId: `account-${index}`},
        sourceChoices: new Map<string, object>(),
        cleanup: [],
        window: {
          isDestroyed: () => false,
          destroy: () => {
            throw new Error('Owned close failure.');
          },
        },
      };
      f.coordinator.flows.set(extra.id, extra);
    }
    assert.doesNotThrow(() => f.coordinator.revalidate());
    assert.equal(f.coordinator.flows.size, 0);
    assert.equal(f.calls.filter(value => value === 'denied').length, 4);
    assert.throws(
      () => f.coordinator.begin({...f.flow.identity, accountId: 'fifth-account'}, {requestId: 'fifth'}),
      /not available/,
    );
  });
  it('does not re-enter teardown while native destruction emits another lifecycle event', () => {
    const f = fixture();
    let destroyed = false;
    let calls = 0;
    f.flow.window = {
      isDestroyed: () => destroyed,
      destroy: () => {
        calls++;
        f.coordinator.revalidate();
        destroyed = true;
      },
    };
    f.coordinator.revalidate();
    assert.equal(calls, 1);
    assert.equal(f.calls.filter(value => value === 'denied').length, 1);
    assert.deepEqual(f.diagnostics, []);
  });
  for (const stage of ['broker-transfer', 'owner-transfer', 'start']) {
    it(`closes only main-owned message ports after ${stage} failure`, async () => {
      const f = fixture(stage);
      Object.assign(f.coordinator.options, {canApprove: () => true});
      await assert.rejects(f.coordinator.select(f.flow, 'source'), /Display source did not start/);
      assert.equal(f.flow.phase, 'ended');
      assert.equal(f.calls.filter(value => value === 'denied').length, 1);
      assert.equal(f.ports[0].transferred, stage !== 'broker-transfer');
      assert.equal(f.ports[1].transferred, stage === 'start');
      assert.equal(f.ports[0].closed, stage === 'broker-transfer');
      assert.equal(f.ports[1].closed, stage !== 'start');
      assert.deepEqual(f.diagnostics, []);
    });
  }
  it('leaves both successfully transferred message ports with their receiving renderers', async () => {
    const f = fixture();
    Object.assign(f.coordinator.options, {canApprove: () => true});
    await f.coordinator.select(f.flow, 'source');
    assert.equal(f.flow.phase, 'active');
    assert.equal(f.calls.filter(value => value === 'started').length, 1);
    f.coordinator.dispose();
    assert.deepEqual(
      f.ports.map(port => [port.transferred, port.closed]),
      [
        [true, false],
        [true, false],
      ],
    );
    assert.deepEqual(f.diagnostics, []);
  });
  it('retains failed main-owned port closure for retry without repeating cancellation', async () => {
    const f = fixture('owner-transfer');
    Object.assign(f.coordinator.options, {canApprove: () => true});
    const close = f.ports[1].close.bind(f.ports[1]);
    f.ports[1].close = () => {
      throw new Error('Owned port close failure.');
    };
    await assert.rejects(f.coordinator.select(f.flow, 'source'), /Display source did not start/);
    assert.deepEqual(f.diagnostics, [['Display capture cleanup failed.']]);
    assert.equal(f.ports[1].closed, false);
    assert.throws(() => f.coordinator.begin(f.flow.identity, {requestId: 'replacement'}), /not available/);
    f.ports[1].close = close;
    f.recover();
    f.coordinator.dispose();
    assert.equal(f.ports[1].closed, true);
    assert.equal(f.calls.filter(value => value === 'denied').length, 1);
    assert.equal(f.flow.cleanup.length, 0);
  });
});
