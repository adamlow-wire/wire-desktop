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

import {strict as assert} from 'assert';

import {
  bindOpenGraphIpc,
  MAX_OPEN_GRAPH_REQUESTS_PER_MINUTE,
  MAX_OPEN_GRAPH_URL_LENGTH,
  OPEN_GRAPH_FETCH_CAPABILITY,
  OPEN_GRAPH_FETCH_CHANNEL,
  requestOpenGraphData,
} from './OpenGraphIpc';
import {SenderIdentity, ViewIdentityRegistry} from './ViewIdentityRegistry';

type BoundHandler = (event: SenderIdentity, request: unknown) => Promise<unknown>;

const metadata = Object.freeze({
  description: 'A description',
  image: {url: 'https://example.com/image.png'},
  title: 'A title',
});

const createSender = (registry: ViewIdentityRegistry, id = 151): SenderIdentity => {
  const frame = {url: 'https://app.wire.test/account'};
  const session = {};
  const webContents = {id, isDestroyed: () => false, mainFrame: frame, session};
  registry.register({
    accountId: 'account-a',
    allowedOrigin: 'https://app.wire.test',
    capabilities: [OPEN_GRAPH_FETCH_CAPABILITY],
    partition: 'persist:account-a',
    session,
    viewType: 'account',
    webContents,
  });
  return {sender: webContents, senderFrame: frame};
};

const createIpc = (handlers: Map<string, BoundHandler>) => ({
  handle: (channel: string, handler: BoundHandler) => handlers.set(channel, handler),
  removeHandler: (channel: string) => handlers.delete(channel),
});

describe('Open Graph IPC contract', () => {
  it('[security-target][INV-002][INV-003][SEC-003] invokes only the fixed channel with an exact request', async () => {
    const calls: unknown[][] = [];

    const result = await requestOpenGraphData(
      {
        invoke: async (...args: unknown[]) => {
          calls.push(args);
          return metadata;
        },
      },
      'https://example.com/article',
    );

    assert.deepStrictEqual(calls, [[OPEN_GRAPH_FETCH_CHANNEL, {url: 'https://example.com/article'}]]);
    assert.deepStrictEqual(result, metadata);
  });

  it('[security-target][INV-002][INV-010][SEC-003] rejects malformed renderer responses', async () => {
    await assert.rejects(
      () => requestOpenGraphData({invoke: async () => ({title: 42})}, 'https://example.com/article'),
      /response payload is invalid/,
    );
  });

  it('[characterization][security-target][INV-003][SEC-003] preserves the requested URL and metadata', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    const urls: string[] = [];
    const dispose = bindOpenGraphIpc(createIpc(handlers), registry, async url => {
      urls.push(url);
      return metadata;
    });
    const handler = handlers.get(OPEN_GRAPH_FETCH_CHANNEL);
    assert.ok(handler);

    assert.deepStrictEqual(await handler(event, {url: 'https://example.com/article'}), metadata);
    assert.deepStrictEqual(urls, ['https://example.com/article']);
    dispose();
    assert.strictEqual(handlers.size, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects unauthorized and malformed requests before fetching', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let fetchCalls = 0;
    bindOpenGraphIpc(createIpc(handlers), registry, async () => {
      fetchCalls += 1;
      return metadata;
    });
    const handler = handlers.get(OPEN_GRAPH_FETCH_CHANNEL);
    assert.ok(handler);

    const unknownEvent = {...event, sender: {...event.sender, id: 152}};
    await assert.rejects(() => handler(unknownEvent, {url: 'https://example.com'}), /not authorized/);
    for (const request of [
      undefined,
      'https://example.com',
      {},
      {url: ''},
      {url: 'https://example.com', extra: true},
      {url: 'x'.repeat(MAX_OPEN_GRAPH_URL_LENGTH + 1)},
    ]) {
      await assert.rejects(() => handler(event, request), /payload/);
    }
    assert.strictEqual(fetchCalls, 0);
  });

  it('[security-target][INV-003][INV-010][SEC-003] rejects malformed main-process responses', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    bindOpenGraphIpc(createIpc(handlers), registry, async () => ({title: 42} as never));
    const handler = handlers.get(OPEN_GRAPH_FETCH_CHANNEL);
    assert.ok(handler);

    await assert.rejects(() => handler(event, {url: 'https://example.com'}), /response payload is invalid/);
  });

  it('[security-target][INV-003][INV-010][SEC-003] limits network requests per account view', async () => {
    const handlers = new Map<string, BoundHandler>();
    const registry = new ViewIdentityRegistry();
    const event = createSender(registry);
    let fetchCalls = 0;
    bindOpenGraphIpc(createIpc(handlers), registry, async () => {
      fetchCalls += 1;
      return metadata;
    });
    const handler = handlers.get(OPEN_GRAPH_FETCH_CHANNEL);
    assert.ok(handler);

    for (let request = 0; request < MAX_OPEN_GRAPH_REQUESTS_PER_MINUTE; request += 1) {
      await handler(event, {url: 'https://example.com'});
    }
    await assert.rejects(() => handler(event, {url: 'https://example.com'}), /rate limit/);
    assert.strictEqual(fetchCalls, MAX_OPEN_GRAPH_REQUESTS_PER_MINUTE);
  });
});
