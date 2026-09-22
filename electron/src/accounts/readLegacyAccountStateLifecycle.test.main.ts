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

import {strict as assert} from 'assert';
import {EventEmitter} from 'events';
import {readFileSync} from 'fs';
import * as path from 'path';
import {runInNewContext} from 'vm';

function fixture(failAt?: string, state: string | null = 'fixture-state') {
  const failure = new Error('controlled reader failure');
  const accountSession = {};
  let destroyed = false;
  let attached = false;
  let detached = 0;
  let options: {show: boolean; webPreferences: Record<string, unknown>};
  const check = (stage: string) => {
    if (failAt === stage) {
      throw failure;
    }
  };
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed,
    setWindowOpenHandler: (handler: () => unknown) => {
      assert.equal((handler() as {action: string}).action, 'deny');
      check('popup');
    },
    debugger: {
      attach: () => {
        check('attach');
        attached = true;
      },
      isAttached: () => attached,
      detach: () => {
        check('detach');
        attached = false;
        detached++;
      },
      sendCommand: async (command: string) => {
        check(command);
        if (command === 'Page.getFrameTree') {
          return {frameTree: {frame: {id: 'fixture'}}};
        }
        if (command === 'Storage.getStorageKey') {
          return {storageKey: 'fixture'};
        }
        return {entries: state === null ? [] : [['state', state]]};
      },
    },
  });
  class Window {
    webContents = contents;
    constructor(value: typeof options) {
      options = value;
    }
    isDestroyed() {
      return destroyed;
    }
    loadFile = async () => {
      check('load');
    };
    destroy() {
      destroyed = true;
      contents.emit('destroyed');
    }
  }
  const filename = path.resolve('electron/src/accounts/readLegacyAccountState.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const expressions: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'readLegacyAccountState' && node.initializer) {
      expressions.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(expressions.length, 1);
  const compiled = ts.transpileModule(`const read = ${expressions[0].getText(source)}; read;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  const read = runInNewContext(compiled, {
    Buffer,
    BrowserWindow: Window,
    bindNavigationGuard: (_contents: unknown, allowed: () => boolean) => {
      assert.equal(allowed(), false);
      check('guard');
    },
  }) as (filename: string, session: object) => Promise<string | undefined>;
  return {
    read: () => read('/fixture/shell.html', accountSession),
    failure,
    destroyed: () => destroyed,
    detached: () => detached,
    preferences: () => options!.webPreferences,
    accountSession,
  };
}

describe('[CAP-001] actual legacy reader lifecycle with inert native ports', () => {
  it('reads exact state with isolated preferences and destroys its reader', async () => {
    const state = fixture();
    assert.equal(await state.read(), 'fixture-state');
    assert.equal(state.destroyed(), true);
    assert.equal(state.detached(), 1);
    const prefs = state.preferences();
    assert.equal(prefs.session, state.accountSession);
    assert.equal(prefs.javascript, false);
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.webviewTag, false);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.sandbox, true);
  });
  it('distinguishes absent state without leaving a reader', async () => {
    const state = fixture(undefined, null);
    assert.equal(await state.read(), undefined);
    assert.equal(state.destroyed(), true);
  });
  it('destroys the reader when state exceeds the byte limit', async () => {
    const state = fixture(undefined, 'x'.repeat(2 * 1024 * 1024 + 1));
    await assert.rejects(state.read(), /size limit/);
    assert.equal(state.destroyed(), true);
  });
  for (const stage of [
    'popup',
    'guard',
    'load',
    'attach',
    'Page.getFrameTree',
    'Storage.getStorageKey',
    'DOMStorage.getDOMStorageItems',
    'detach',
  ]) {
    it(`destroys the reader when ${stage} fails`, async () => {
      const state = fixture(stage);
      await assert.rejects(state.read(), error => error === state.failure);
      assert.equal(state.destroyed(), true);
    });
  }
});
