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

function fixture() {
  const windows: FakeWindow[] = [];
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const loaded = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const targetSession = {webRequest: {onBeforeRequest() {}}};
  class FakeWindow extends EventEmitter {
    destroyed = false;
    shown = 0;
    sent = 0;
    webContents = {
      id: 1,
      session: targetSession,
      setWindowOpenHandler() {},
      send: () => {
        this.sent++;
      },
    };
    constructor(_options: unknown) {
      super();
      windows.push(this);
    }
    setMenuBarVisibility() {}
    loadURL() {
      return loaded;
    }
    show() {
      this.shown++;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      if (!this.destroyed) {
        this.destroyed = true;
        this.emit('closed');
      }
    }
  }
  const filename = path.resolve('electron/src/window/ProxyPromptWindow.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const initializers: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'showWindow' && node.initializer) {
      initializers.push(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(initializers.length, 1);
  const compiled = ts.transpileModule(`const showWindow = ${initializers[0].getText(source)}; showWindow;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  const show = runInNewContext(compiled, {
    URL,
    BrowserWindow: FakeWindow,
    session: {fromPartition: () => targetSession},
    windowSize: {WIDTH: 550, HEIGHT: 350},
    config: {name: 'fixture'},
    preloadPath: '/fixture/preload',
    promptHtmlPath: 'wire-app://shell/html/proxy-prompt.html',
    proxyPromptWindowAllowList: [],
    registerViewIdentity() {},
    bindNavigationGuard() {},
    PROXY_PROMPT_CANCEL_CAPABILITY: 'cancel',
    PROXY_PROMPT_LOCALE_READ_CAPABILITY: 'locale',
    PROXY_PROMPT_SUBMIT_CAPABILITY: 'submit',
    EVENT_TYPE: {PROXY_PROMPT: {LOADED: 'loaded'}},
  }) as (registry: object, created: (id: number) => () => void) => Promise<FakeWindow>;
  let closes = 0;
  const pending = show({}, () => () => {
    closes++;
  });
  return {windows, resolve, reject, pending, closes: () => closes};
}

describe('[CAP-005] production proxy window load lifecycle (inert native ports)', () => {
  it('shows and notifies only after the prompt loads', async () => {
    const state = fixture();
    assert.equal(state.windows[0].shown, 0);
    assert.equal(state.windows[0].sent, 0);
    state.resolve();
    assert.equal(await state.pending, state.windows[0]);
    assert.equal(state.windows[0].shown, 1);
    assert.equal(state.windows[0].sent, 1);
    state.windows[0].destroy();
    assert.equal(state.closes(), 1);
  });

  it('destroys a failed hidden prompt and closes its registration', async () => {
    const state = fixture();
    const failure = new Error('fixture sensitive load failure');
    const rejected = assert.rejects(state.pending, error => {
      assert.notEqual(error, failure);
      assert.equal((error as Error).message, 'Could not open proxy prompt.');
      return true;
    });
    state.reject(failure);
    await rejected;
    assert.equal(state.windows[0].destroyed, true);
    assert.equal(state.closes(), 1);
    assert.equal(state.windows[0].shown, 0);
    assert.equal(state.windows[0].sent, 0);
  });

  it('does not show or notify a prompt closed while loading', async () => {
    const state = fixture();
    const rejected = assert.rejects(
      state.pending,
      error => (error as Error).message === 'Could not open proxy prompt.',
    );
    state.windows[0].destroy();
    state.resolve();
    await rejected;
    assert.equal(state.closes(), 1);
    assert.equal(state.windows[0].shown, 0);
    assert.equal(state.windows[0].sent, 0);
  });
});
