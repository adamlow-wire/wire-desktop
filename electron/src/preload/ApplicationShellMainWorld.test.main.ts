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

import {
  createApplicationShellMainWorld,
  focusSelectedWebview,
  getAccountWebContentsId,
  operateSelectedWebview,
  reloadAllWebviews,
  sendAccountWebviewEvent,
  sendSelectedWebviewEvent,
} from './ApplicationShellMainWorld';

describe('application shell main-world adapter', () => {
  const host = globalThis as unknown as {document?: unknown};
  const originalDocument = host.document;

  afterEach(() => {
    host.document = originalDocument;
  });

  it('[security-target][INV-002][SEC-005] operates webview methods in the main world', () => {
    const calls: Array<{args: unknown[]; name: string}> = [];
    const selected = {
      blur: () => calls.push({args: [], name: 'blur'}),
      copy: () => calls.push({args: [], name: 'copy'}),
      cut: () => calls.push({args: [], name: 'cut'}),
      focus: () => calls.push({args: [], name: 'focus'}),
      paste: () => calls.push({args: [], name: 'paste'}),
      redo: () => calls.push({args: [], name: 'redo'}),
      reload: () => calls.push({args: [], name: 'reload-selected'}),
      selectAll: () => calls.push({args: [], name: 'select-all'}),
      send: (...args: unknown[]) => calls.push({args, name: 'send-selected'}),
      undo: () => calls.push({args: [], name: 'undo'}),
    };
    const account = {
      dataset: {accountid: 'account-a'},
      getWebContentsId: () => 41,
      reload: () => calls.push({args: [], name: 'reload-account'}),
      send: (...args: unknown[]) => calls.push({args, name: 'send-account'}),
    };
    host.document = {
      querySelector: () => selected,
      querySelectorAll: () => [account],
    };

    sendSelectedWebviewEvent('menu-action', [{safe: true}]);
    sendSelectedWebviewEvent('menu-action-without-payload', []);
    sendAccountWebviewEvent('account-a', 'account-action', ['value']);
    sendAccountWebviewEvent('account-a', 'account-action-without-payload', []);
    for (const operation of ['copy', 'cut', 'paste', 'redo', 'selectAll', 'undo'] as const) {
      operateSelectedWebview(operation);
    }
    focusSelectedWebview();
    reloadAllWebviews();

    assert.strictEqual(getAccountWebContentsId('account-a'), 41);
    assert.deepStrictEqual(calls, [
      {args: ['menu-action', {safe: true}], name: 'send-selected'},
      {args: ['menu-action-without-payload'], name: 'send-selected'},
      {args: ['account-action', 'value'], name: 'send-account'},
      {args: ['account-action-without-payload'], name: 'send-account'},
      {args: [], name: 'copy'},
      {args: [], name: 'cut'},
      {args: [], name: 'paste'},
      {args: [], name: 'redo'},
      {args: [], name: 'select-all'},
      {args: [], name: 'undo'},
      {args: [], name: 'blur'},
      {args: [], name: 'focus'},
      {args: [], name: 'reload-account'},
    ]);
  });

  it('[security-target][INV-002][SEC-005] invokes only fixed serialized functions', () => {
    const scripts: Electron.ExecutionScript[] = [];
    const mainWorld = createApplicationShellMainWorld({
      executeInMainWorld: script => {
        scripts.push(script);
        return script.func === getAccountWebContentsId ? 41 : undefined;
      },
    });

    mainWorld.sendToSelected('menu-action', {safe: true});
    mainWorld.sendToAccount('account-a', 'account-action', 'value');
    mainWorld.operateSelected('paste');
    mainWorld.focusSelected();
    mainWorld.reloadAll();

    assert.strictEqual(mainWorld.getWebContentsId('account-a'), 41);
    assert.deepStrictEqual(
      scripts.map(script => script.func),
      [
        sendSelectedWebviewEvent,
        sendAccountWebviewEvent,
        operateSelectedWebview,
        focusSelectedWebview,
        reloadAllWebviews,
        getAccountWebContentsId,
      ],
    );
  });
});
