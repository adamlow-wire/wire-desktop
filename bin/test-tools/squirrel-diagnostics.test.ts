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

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

type Child = EventEmitter & {stdout: EventEmitter; stderr: EventEmitter};

const loadProductionUpdater = (options: {
  feed: string;
  onSpawn: (command: string, args: string[]) => Child;
  diagnostics: string[];
}): {installUpdate: () => Promise<void>} => {
  const filename = path.resolve('electron/src/update/squirrel.ts');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const names = new Set(['spawn', 'spawnUpdate', 'installUpdate']);
  const declarations = source.statements
    .filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement) && Boolean(statement.name && names.has(statement.name.text)),
    )
    .map(statement => statement.getText(source).replace(/^export\s+/, ''));
  assert.equal(declarations.length, names.size, 'Execute the actual Squirrel updater functions.');
  const compiled = ts.transpileModule(`${declarations.join('\n')}\n({installUpdate});`, {
    compilerOptions: {module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const logger = {
    error: (...values: unknown[]) => options.diagnostics.push(values.map(String).join(' ')),
    info: (...values: unknown[]) => options.diagnostics.push(values.map(String).join(' ')),
  };
  return vm.runInNewContext(compiled, {
    Buffer,
    childProcess: {spawn: options.onSpawn},
    EnvironmentUtil: {app: {UPDATE_URL_WIN: options.feed}},
    isSquirrelInstallation: () => true,
    logger,
    path,
    updateDotExe: path.join('fixture', 'Update.exe'),
  });
};

const childThatCloses = (code: number, output = ''): Child => {
  const child = Object.assign(new EventEmitter(), {stdout: new EventEmitter(), stderr: new EventEmitter()});
  queueMicrotask(() => {
    if (output) {
      child.stdout.emit('data', Buffer.from(output));
      child.stderr.emit('data', Buffer.from(output));
    }
    child.emit('close', code, null);
  });
  return child;
};

const loadProductionScheduler = (diagnostics: string[], checks: Array<() => Promise<void>>) => {
  const filename = path.resolve('electron/src/update/squirrel.ts');
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'scheduleUpdate',
  );
  assert.ok(declaration, 'Execute the actual Squirrel scheduling function.');
  const compiled = ts.transpileModule(`${declaration.getText(source)}\n scheduleUpdate;`, {
    compilerOptions: {module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const registered: Array<() => Promise<void>> = [];
  const scheduleUpdate = vm.runInNewContext(compiled, {
    HOUR_IN_MILLIS: 3_600_000,
    MINUTE_IN_MILLIS: 60_000,
    StringUtil: {pluralize: (word: string) => word},
    config: {squirrelUpdateInterval: {DELAY: 60_000, INTERVAL: 3_600_000}},
    installUpdate: () => checks.shift()?.(),
    logger: {
      info: (...values: unknown[]) => diagnostics.push(values.map(String).join(' ')),
      error: (...values: unknown[]) => diagnostics.push(values.map(String).join(' ')),
    },
    setInterval: (callback: () => Promise<void>) => registered.push(callback),
    setTimeout: (callback: () => Promise<void>) => registered.push(callback),
  }) as () => Promise<void>;
  return {scheduleUpdate, registered};
};

describe('Squirrel updater diagnostic boundary', () => {
  it('passes the configured feed to Update.exe without logging credential-bearing arguments or process output', async () => {
    const token = 'synthetic-updater-token';
    const feed = `https://user:${token}@updates.invalid/feed?access_token=${token}`;
    const diagnostics: string[] = [];
    const spawned: Array<{command: string; args: string[]}> = [];
    const {installUpdate} = loadProductionUpdater({
      feed,
      diagnostics,
      onSpawn(command, args) {
        spawned.push({command, args});
        return childThatCloses(0, token);
      },
    });

    await installUpdate();
    assert.equal(spawned.length, 1);
    assert.deepEqual([...spawned[0].args], ['--update', feed]);
    assert.ok(spawned[0].command.endsWith('Update.exe'));
    assert.equal(
      diagnostics.join('\n').includes(token),
      false,
      'Updater diagnostics must not retain feed or child secrets.',
    );
  });

  it('contains a scheduled updater rejection without leaking its native cause', async () => {
    const token = 'synthetic-updater-error';
    const diagnostics: string[] = [];
    const {scheduleUpdate, registered} = loadProductionScheduler(diagnostics, [
      () => Promise.reject(new Error(token)),
      () => Promise.reject(new Error(token)),
    ]);
    await scheduleUpdate();
    assert.equal(registered.length, 2);
    for (const check of registered) {
      await assert.doesNotReject(() => Promise.resolve(check()));
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(diagnostics.join('\n').includes(token), false);
    assert.ok(
      diagnostics.some(message => /failed/i.test(message)),
      'Scheduled failure needs a safe diagnostic.',
    );
  });

  it('rejects synchronous and native spawn errors without logging their contents', async () => {
    const token = 'synthetic-spawn-secret';
    for (const mode of ['throw', 'event']) {
      const diagnostics: string[] = [];
      const {installUpdate} = loadProductionUpdater({
        feed: 'https://updates.invalid/feed',
        diagnostics,
        onSpawn: () => {
          if (mode === 'throw') {
            throw new Error(token);
          }
          const child = Object.assign(new EventEmitter(), {stdout: new EventEmitter(), stderr: new EventEmitter()});
          queueMicrotask(() => {
            child.emit('error', new Error(token));
            child.emit('close', 1, null);
          });
          return child;
        },
      });
      await assert.rejects(installUpdate(), /could not start/i);
      assert.equal(diagnostics.join('\n').includes(token), false);
    }
  });

  it('rejects a nonzero Update.exe exit instead of reporting success', async () => {
    const diagnostics: string[] = [];
    const {installUpdate} = loadProductionUpdater({
      feed: 'https://updates.invalid/feed',
      diagnostics,
      onSpawn: () => childThatCloses(9),
    });

    await assert.rejects(installUpdate(), /updater|exit/i);
  });
});
