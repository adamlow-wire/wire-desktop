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

import ts from 'typescript';

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const MAX_BYTES = 15 * 1024 * 1024;

type ImageAction = {kind: string; sourceUrl: string};
type ImageActionListener = (_event: unknown, action: ImageAction) => void;

function loadPreload(
  fetchResponse: (_url?: unknown, options?: {signal?: AbortSignal}) => Promise<unknown>,
  timeoutSignal: (milliseconds: number) => AbortSignal = AbortSignal.timeout.bind(AbortSignal),
) {
  const source = fs.readFileSync(path.resolve('electron/src/preload/menu/preload-context.ts'), 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
  }).outputText;
  const invocations: unknown[] = [];
  const diagnostics: unknown[] = [];
  let listener: ImageActionListener | undefined;
  const ipcRenderer = {
    invoke: async (_channel: string, request: unknown) => {
      invocations.push(request);
    },
    on: (_channel: string, callback: ImageActionListener) => {
      listener = callback;
    },
  };
  const exports = {};
  const dependencies: Record<string, unknown> = {
    electron: {ipcRenderer},
    './ContextMenuImageAction': {CONTEXT_MENU_IMAGE_ACTION_CHANNEL: 'context-image-action'},
    '../../security/SavePictureContract': {MAX_SAVE_PICTURE_BYTES: MAX_BYTES, SAVE_PICTURE_CHANNEL: 'save-picture'},
    '../../settings/config': {config: {userAgent: 'Wire-test'}},
  };
  vm.runInNewContext(javascript, {
    AbortSignal: {timeout: timeoutSignal},
    Uint8Array,
    console: {error: (...args: unknown[]) => diagnostics.push(args)},
    exports,
    fetch: fetchResponse,
    require: (name: string) => {
      assert.ok(name in dependencies, `Unexpected preload dependency ${name}`);
      return dependencies[name];
    },
  });
  assert.ok(listener, 'Image action listener was registered');
  return {diagnostics, invocations, listener};
}

function streamResponse(chunk: Uint8Array, count: number) {
  let reads = 0;
  let cancellations = 0;
  let wholeBodyReads = 0;
  return {
    get cancellations() {
      return cancellations;
    },
    get reads() {
      return reads;
    },
    get wholeBodyReads() {
      return wholeBodyReads;
    },
    body: {
      getReader: () => ({
        cancel: async () => {
          cancellations++;
        },
        read: async () => {
          reads++;
          return reads <= count ? {done: false, value: chunk} : {done: true};
        },
        releaseLock: () => undefined,
      }),
    },
    arrayBuffer: async () => {
      wholeBodyReads++;
      return new ArrayBuffer(1);
    },
  };
}

describe('[SEC-008] account image save preload', () => {
  it('ignores non-save context actions', async () => {
    const response = streamResponse(new Uint8Array(1), 1);
    const preload = loadPreload(async () => response);
    preload.listener(undefined, {kind: 'copy', sourceUrl: 'https://example.test/image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(response.reads, 0);
    assert.strictEqual(response.wholeBodyReads, 0);
    assert.deepStrictEqual(preload.invocations, []);
  });

  it('[security-target] stops an oversized stream before invoking the save IPC', async () => {
    const response = streamResponse(new Uint8Array(1024 * 1024), 16);
    const preload = loadPreload(async () => response);
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/large-image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(response.wholeBodyReads, 0, 'Must not buffer the whole response');
    assert.strictEqual(response.reads, 16, 'Must stop at the first over-limit chunk');
    assert.strictEqual(response.cancellations, 1);
    assert.deepStrictEqual(preload.invocations, []);
    assert.deepStrictEqual(preload.diagnostics, [['Could not save picture.']]);
  });

  it('[security-target] admits only one in-flight remote image read', async () => {
    let completeRead!: () => void;
    const pendingRead = new Promise<void>(resolve => (completeRead = resolve));
    let fetches = 0;
    const preload = loadPreload(async () => {
      fetches++;
      return {
        body: {
          getReader: () => ({
            cancel: async () => undefined,
            read: async () => {
              await pendingRead;
              return {done: true};
            },
            releaseLock: () => undefined,
          }),
        },
      };
    });
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/first-image'});
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/second-image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(fetches, 1, 'A second click must not start another remote read');
    completeRead();
    await new Promise(resolve => setImmediate(resolve));
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/third-image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(fetches, 2, 'The slot must reopen after the first read settles');
  });

  it('[security-target] aborts a stalled remote fetch with a fixed diagnostic', async () => {
    const controller = new AbortController();
    let timeoutMs: number | undefined;
    const preload = loadPreload(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('synthetic private fetch detail')));
        }),
      milliseconds => {
        timeoutMs = milliseconds;
        return controller.signal;
      },
    );
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/stalled-image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(timeoutMs && timeoutMs <= 60_000, 'Remote image read needs a finite one-minute bound');
    controller.abort();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(preload.invocations, []);
    assert.deepStrictEqual(preload.diagnostics, [['Could not save picture.']]);
  });

  it('[security-target] aborts a stalled response body without retaining the save slot', async () => {
    const controllers: AbortController[] = [];
    let fetches = 0;
    const preload = loadPreload(
      async (_url, options) => {
        fetches++;
        return {
          body: {
            getReader: () => ({
              cancel: async () => undefined,
              read: async () =>
                new Promise((_resolve, reject) => {
                  options?.signal?.addEventListener('abort', () => reject(new Error('private body failure')));
                }),
              releaseLock: () => undefined,
            }),
          },
        };
      },
      () => {
        const controller = new AbortController();
        controllers.push(controller);
        return controller.signal;
      },
    );
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/slow-body'});
    await new Promise(resolve => setImmediate(resolve));
    controllers[0].abort();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(preload.diagnostics, [['Could not save picture.']]);
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/new-body'});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(fetches, 2, 'A failed read must release the account save slot');
    controllers[1].abort();
    await new Promise(resolve => setImmediate(resolve));
  });

  it('[security-target] reports fetch failure without logging the response error', async () => {
    const preload = loadPreload(async () => {
      throw new Error('synthetic private response detail');
    });
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/private-image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(preload.invocations, []);
    assert.deepStrictEqual(preload.diagnostics, [['Could not save picture.']]);
  });

  it('[security-target] sends exact bytes of a bounded stream', async () => {
    const response = streamResponse(new Uint8Array([2, 7, 4]), 2);
    const preload = loadPreload(async () => response);
    preload.listener(undefined, {kind: 'save', sourceUrl: 'https://example.test/small-image'});
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(response.wholeBodyReads, 0);
    assert.strictEqual(preload.invocations.length, 1);
    const request = preload.invocations[0] as {bytes: Uint8Array};
    assert.deepStrictEqual(Array.from(request.bytes), [2, 7, 4, 2, 7, 4]);
  });
});
