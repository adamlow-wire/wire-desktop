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
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';

interface Coordinator {
  options: object;
  startup: Promise<void>;
  begin(identity: object, request: {requestId: string}): Promise<unknown>;
  dispose(): void;
}

const fixture = (failureStage?: string) => {
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
  let observed = 0;
  // Retain the otherwise discarded load promise for assertions. Handler logic is unchanged.
  const transformed = ts.transform(isolated, [
    context => root => {
      const visit: ts.Visitor = node => {
        if (
          ts.isVoidExpression(node) &&
          node.expression.getText(source).replace(/\s/g, '').startsWith('window.loadURL(')
        ) {
          observed++;
          return ts.factory.createBinaryExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createThis(), 'startup'),
            ts.SyntaxKind.EqualsToken,
            node.expression,
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(root, visit) as ts.ClassDeclaration;
    },
  ]);
  assert.equal(observed, 1);
  const compiled = ts.transpileModule(
    `${ts
      .createPrinter()
      .printNode(ts.EmitHint.Unspecified, transformed.transformed[0], source)}\nDisplayCaptureCoordinator;`,
    {compilerOptions: {target: ts.ScriptTarget.ES2022}},
  ).outputText;
  transformed.dispose();
  const calls: string[] = [];
  const detail = new Error('Synthetic private startup detail.');
  const check = (name: string) => {
    calls.push(name);
    if (failureStage === name) {
      throw detail;
    }
  };
  const parent = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
  });
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    mainFrame: {postMessage: () => calls.push('notify')},
  });
  const identity = {accountId: 'owned-account', webContents: owner, mainFrame: owner.mainFrame};
  let window!: FakeWindow;
  class FakeWindow extends EventEmitter {
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), {setWindowOpenHandler: () => undefined});
    constructor() {
      super();
      window = this;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      calls.push('destroy');
      this.destroyed = true;
      this.emit('closed');
    }
    loadURL() {
      return failureStage === 'load' ? Promise.reject(detail) : Promise.resolve();
    }
    show() {
      check('show');
    }
    focus() {
      check('focus');
    }
  }
  const target = Object.assign(new EventEmitter(), {
    setPermissionCheckHandler: () => undefined,
    setPermissionRequestHandler: () => undefined,
    setDisplayMediaRequestHandler: () => undefined,
  });
  let nextId = 0;
  const Constructor = runInNewContext(compiled, {
    BrowserWindow: FakeWindow,
    session: {fromPartition: () => target},
    installLocalContentProtocol: () => () => calls.push('uninstall'),
    registerViewIdentity: () => ({revoke: () => calls.push('revoke')}),
    bindNavigationGuard: () => undefined,
    randomUUID: () => `owned-${++nextId}`,
    locale: {getText: () => 'Test capture'},
    path,
    URL,
    DISPLAY_BROKER_URL: 'wire-app://shell/html/display-capture.html',
    DISPLAY_BROKER_CAPABILITY: 'broker',
    DISPLAY_CAPTURE_CAPABILITY: 'capture',
    DISPLAY_CAPTURE_ENDED_CHANNEL: 'ended',
    DISPLAY_CAPTURE_LIMITS: {promptTimeoutMs: 60_000},
    setTimeout: () => 1,
    clearTimeout: () => calls.push('clear-timer'),
    console: {warn: (...values: unknown[]) => calls.push(JSON.stringify(values))},
  }) as new () => Coordinator;
  const coordinator = new Constructor();
  let foregroundChecks = 0;
  coordinator.options = {
    directory: '/test-owned',
    registry: {authorize: () => identity},
    isEligible: () => true,
    isForeground: () => {
      if (++foregroundChecks > 1) {
        check('foreground');
      }
      return true;
    },
    parentWindow: () => parent,
  };
  let outcome: unknown;
  let settled = false;
  void coordinator.begin(identity, {requestId: 'request'}).then(
    value => {
      outcome = value;
      settled = true;
    },
    error => {
      outcome = error;
      settled = true;
    },
  );
  return {coordinator, calls, parent, owner, window, settled: () => settled, outcome: () => outcome};
};

describe('[CAP-003][INV-010] broker startup promise ownership with inert windows', () => {
  for (const stage of ['load', 'foreground', 'show', 'focus']) {
    it(`settles cancellation and releases resources after ${stage} failure`, async () => {
      const f = fixture(stage);
      try {
        await assert.doesNotReject(f.coordinator.startup);
        await Promise.resolve();
        assert.equal(f.settled(), true);
        assert.equal((f.outcome() as Error).message, 'Display capture was cancelled or ended.');
        assert.equal(f.window.destroyed, true);
        assert.equal(f.calls.filter(value => value === 'revoke').length, 1);
        assert.equal(f.calls.filter(value => value === 'uninstall').length, 1);
        assert.equal(f.parent.listenerCount('hide'), 0);
        assert.equal(f.owner.listenerCount('destroyed'), 0);
        assert.equal(
          f.calls.some(value => value.includes('Synthetic private')),
          false,
        );
      } finally {
        f.coordinator.dispose();
      }
    });
  }
  it('keeps a successfully shown chooser pending until explicit cancellation', async () => {
    const f = fixture();
    try {
      await f.coordinator.startup;
      assert.equal(f.settled(), false);
      assert.equal(f.window.destroyed, false);
      assert.ok(f.calls.includes('show') && f.calls.includes('focus'));
      f.coordinator.dispose();
      await Promise.resolve();
      assert.equal(f.settled(), true);
      assert.equal((f.outcome() as Error).message, 'Display capture was cancelled or ended.');
    } finally {
      f.coordinator.dispose();
    }
  });
});
