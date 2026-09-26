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

interface InertCoordinator {
  options: object;
  current(flow: object): boolean;
  select(flow: object, choiceId: string): Promise<void>;
  end(flow: object): void;
}

const coordinatorClass = (): new () => InertCoordinator => {
  const filename = path.resolve('electron/src/calling/display/DisplayCaptureCoordinator.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements
    .filter(ts.isClassDeclaration)
    .find(node => node.name?.text === 'DisplayCaptureCoordinator')!;
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
    {compilerOptions: {target: ts.ScriptTarget.ES2022}},
  ).outputText;
  class Port {
    close(): void {}
  }
  return runInNewContext(compiled, {
    MessageChannelMain: class {
      port1 = new Port();
      port2 = new Port();
    },
    DISPLAY_BROKER_PORT_CHANNEL: 'broker-port',
    DISPLAY_CAPTURE_PORT_CHANNEL: 'capture-port',
    DISPLAY_CAPTURE_CAPABILITY: 'capture',
    DISPLAY_CAPTURE_ENDED_CHANNEL: 'ended',
    DISPLAY_CAPTURE_LIMITS: {frameTimeoutMs: 10_000},
    setTimeout: () => 1,
    clearTimeout: () => undefined,
    console,
  }) as new () => InertCoordinator;
};

describe('[CAP-003] selected display chooser lifetime with inert ports', () => {
  it('keeps the approved relay active without a separate visible Stop window and ends on call Stop', async () => {
    const calls: string[] = [];
    const Constructor = coordinatorClass();
    const coordinator = new Constructor();
    const mainFrame = {postMessage: (channel: string) => calls.push(channel)};
    const owner = {mainFrame, isDestroyed: () => false};
    const identity = {mainFrame, webContents: owner, accountId: 'owned'};
    coordinator.options = {
      registry: {authorize: () => identity},
      isEligible: () => true,
      canApprove: () => true,
    };
    let visible = true;
    let destroyed = false;
    const window = {
      isFocused: () => true,
      isDestroyed: () => destroyed,
      setParentWindow: (parent: unknown) => {
        assert.equal(parent, null);
        calls.push('detached');
      },
      hide: () => {
        visible = false;
        calls.push('hidden');
      },
      destroy: () => {
        destroyed = true;
        calls.push('destroyed');
      },
      webContents: {
        mainFrame: {postMessage: (channel: string) => calls.push(channel)},
        executeJavaScript: async () => {
          flow.displayUsed = true;
          return true;
        },
      },
    };
    const source = {name: 'Selected test screen', thumbnail: '', video: mainFrame};
    let resolved: unknown;
    const flow = {
      id: 'flow',
      requestId: 'request',
      identity,
      owner,
      window,
      sourceChoices: new Map([['approved-choice', source]]),
      phase: 'choosing',
      permissionUsed: true,
      displayUsed: false,
      choicesRead: true,
      cleanup: [] as Array<() => void>,
      resolve: (value: unknown) => {
        resolved = value;
      },
      reject: () => undefined,
    };
    assert.equal(coordinator.current(flow), true, 'fixture must own the active account');
    await coordinator.select(flow, 'approved-choice');
    assert.equal(flow.phase, 'active');
    assert.equal((resolved as {flowId: string}).flowId, 'flow');
    assert.equal(visible, false, 'the capture relay must not leave a Stop dialog over the call');
    assert.equal(destroyed, false, 'hiding the broker must not end the approved source');
    assert.ok(calls.includes('capture-port'));
    coordinator.end(flow);
    assert.equal(destroyed, true);
    assert.ok(calls.includes('ended'));
  });
});
