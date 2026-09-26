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

import * as captureContract from './DisplayCaptureContract';

import {bindAuthorizedIpc} from '../../security/AuthorizedIpc';
import {ViewIdentityRegistry} from '../../security/ViewIdentityRegistry';

type IpcPort = Parameters<typeof bindAuthorizedIpc>[0];
type Handler = Parameters<IpcPort['handle']>[1];

const channels = [
  captureContract.DISPLAY_CAPTURE_BEGIN_CHANNEL,
  captureContract.DISPLAY_CAPTURE_STOP_CHANNEL,
  captureContract.DISPLAY_BROKER_READ_CHANNEL,
  captureContract.DISPLAY_BROKER_SELECT_CHANNEL,
  captureContract.DISPLAY_BROKER_HEARTBEAT_CHANNEL,
  captureContract.DISPLAY_BROKER_STOP_CHANNEL,
];

const fixture = (conflictingChannel?: string) => {
  const filename = path.resolve('electron/src/calling/display/DisplayCaptureCoordinator.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(
    node =>
      (ts.isClassDeclaration(node) && node.name?.text === 'DisplayCaptureCoordinator') ||
      (ts.isVariableStatement(node) &&
        node.declarationList.declarations.some(entry => entry.name.getText(source) === 'contract')),
  );
  assert.equal(declarations.length, 2);
  // Keep the actual contract and complete class, including the constructor.
  const printed = declarations
    .map(node => {
      const declaration = ts.isClassDeclaration(node)
        ? ts.factory.updateClassDeclaration(
            node,
            undefined,
            node.name,
            node.typeParameters,
            node.heritageClauses,
            node.members,
          )
        : node;
      return ts.createPrinter().printNode(ts.EmitHint.Unspecified, declaration, source);
    })
    .join('\n');
  const compiled = ts.transpileModule(`${printed}\nDisplayCaptureCoordinator;`, {
    compilerOptions: {target: ts.ScriptTarget.ES2022},
  }).outputText;
  const handlers = new Map<string, Handler>();
  const removed: string[] = [];
  const conflict = new Error('Attempted to register a second handler.');
  const foreign: Handler = async () => 'foreign owner';
  if (conflictingChannel) {
    handlers.set(conflictingChannel, foreign);
  }
  const ipcMain: IpcPort = {
    handle: (channel, handler) => {
      if (handlers.has(channel)) {
        throw conflict;
      }
      handlers.set(channel, handler);
    },
    removeHandler: channel => {
      removed.push(channel);
      handlers.delete(channel);
    },
  };
  const Constructor = runInNewContext(compiled, {...captureContract, ipcMain, bindAuthorizedIpc}) as new (
    options: object,
  ) => {dispose(): void};
  return {handlers, removed, conflict, foreign, create: () => new Constructor({registry: new ViewIdentityRegistry()})};
};

describe('[CAP-003][INV-003] capture constructor IPC ownership with an inert duplicate-rejecting port', () => {
  it('registers all six actual authorized contracts and disposes only its handlers once', async () => {
    const f = fixture();
    const coordinator = f.create();
    try {
      assert.deepEqual([...f.handlers.keys()], channels);
      for (const handler of f.handlers.values()) {
        await assert.rejects(() =>
          handler({sender: {} as never, senderFrame: {url: 'https://unregistered.invalid'}}, {}),
        );
      }
    } finally {
      coordinator.dispose();
    }
    assert.equal(f.handlers.size, 0);
    assert.deepEqual(f.removed, channels);
    coordinator.dispose();
    assert.deepEqual(f.removed, channels);
  });
  for (const channel of channels) {
    it(`rolls back its earlier bindings and preserves the foreign owner when ${channel} conflicts`, () => {
      const f = fixture(channel);
      assert.throws(f.create, error => error === f.conflict);
      assert.deepEqual([...f.handlers.keys()], [channel]);
      assert.equal(f.handlers.get(channel), f.foreign);
      assert.deepEqual(f.removed, channels.slice(0, channels.indexOf(channel)));
      f.handlers.delete(channel);
      const retry = f.create();
      assert.deepEqual([...f.handlers.keys()], channels);
      retry.dispose();
      assert.equal(f.handlers.size, 0);
    });
  }
});
