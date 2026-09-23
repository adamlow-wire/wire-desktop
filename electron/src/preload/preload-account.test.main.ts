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
 */

import {ModuleKind, ScriptTarget, transpileModule} from 'typescript';

import {strict as assert} from 'assert';
import {readFileSync} from 'fs';
import * as path from 'path';
import {runInNewContext} from 'vm';

function fixture(invoke: (channel: string, event: unknown) => Promise<unknown>) {
  const warnings: unknown[][] = [];
  let emit!: (event: unknown) => void;
  const filename = path.join(process.cwd(), 'electron/src/preload/preload-account.ts');
  const compiled = transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ModuleKind.CommonJS, target: ScriptTarget.ES2022},
  }).outputText;
  const dependencies: Record<string, unknown> = {
    electron: {ipcRenderer: {invoke}},
    './installWebappPreload': {installWebappPreload: (callback: typeof emit) => (emit = callback)},
    '../runtime/rendererRuntimeArguments': {readRendererApplockOverride: () => undefined},
    '../security/AccountEventContract': {ACCOUNT_EVENT_CHANNEL: 'account-event-test-channel'},
  };
  runInNewContext(compiled, {
    exports: {},
    console: {warn: (...args: unknown[]) => warnings.push(args)},
    require(name: string) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected account preload dependency: ${name}`);
      return dependencies[name];
    },
  });
  assert.ok(emit);
  return {emit, warnings};
}

const settle = () => new Promise(resolve => setImmediate(resolve));

describe('account preload event diagnostics (inert Node ports)', () => {
  it('[regression][CAP-001] forwards the event on the fixed IPC channel without logging success', async () => {
    const event = {type: 'account-event', value: 'synthetic'};
    const invocations: unknown[][] = [];
    const {emit, warnings} = fixture(async (channel, payload) => {
      invocations.push([channel, payload]);
    });
    emit(event);
    await settle();
    assert.deepEqual(invocations, [['account-event-test-channel', event]]);
    assert.deepEqual(warnings, []);
  });

  it('[security-target][CAP-001] reports rejection without logging the rejected private Error', async () => {
    const privateError = new Error('synthetic-private-account-event-value');
    const {emit, warnings} = fixture(async () => {
      throw privateError;
    });
    emit({type: 'account-event'});
    await settle();
    assert.deepEqual(warnings, [['Account event rejected.']]);
    assert.ok(!warnings.flat().includes(privateError));
  });
});
